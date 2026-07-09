import WebSocket from 'ws'

/**
 * Минимальный клиент протокола socket.io 0.9 (форк Overleaf) поверх ws.
 * Кадры: `тип:id:endpoint:данные`
 *   1:: connected, 2:: heartbeat, 5:::{json} событие,
 *   5:<id>+::{json} событие с ack, 6:::<id>+[args] ack, 0:: disconnect.
 */

export interface SioOptions {
  serverUrl: string
  projectId: string
  cookie: string
  /** таймаут ожидания ack, мс */
  ackTimeoutMs?: number
}

export class SioError extends Error {}

export class SioClient {
  private ws?: WebSocket
  private msgId = 0
  private acks = new Map<number, {
    resolve: (args: unknown[]) => void
    reject: (err: Error) => void
    timer: NodeJS.Timeout
  }>()
  private heartbeatSec = 60
  private watchdog?: NodeJS.Timeout
  private closedByUs = false

  onEvent?: (name: string, args: unknown[]) => void
  onConnect?: () => void
  onDisconnect?: (reason: string) => void

  constructor(private opts: SioOptions) {}

  get isOpen(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }

  async connect(): Promise<void> {
    this.closedByUs = false
    const base = this.opts.serverUrl.replace(/\/+$/, '')
    const handshakeUrl = `${base}/socket.io/1/?projectId=${this.opts.projectId}&t=${Date.now()}`
    let res: Response
    try {
      res = await fetch(handshakeUrl, {
        headers: { Cookie: this.opts.cookie },
      })
    } catch (err) {
      throw new SioError(
        `handshake недоступен: ${err instanceof Error ? err.message : err}`
      )
    }
    if (!res.ok) {
      throw new SioError(`handshake HTTP ${res.status}`)
    }
    const text = await res.text()
    const [sid, hb] = text.split(':')
    if (!sid) throw new SioError(`некорректный handshake: ${text.slice(0, 80)}`)
    this.heartbeatSec = parseInt(hb, 10) || 60

    const wsUrl =
      base.replace(/^http/, 'ws') +
      `/socket.io/1/websocket/${sid}?projectId=${this.opts.projectId}`
    const ws = new WebSocket(wsUrl, {
      headers: { Cookie: this.opts.cookie },
    })
    this.ws = ws
    await new Promise<void>((resolve, reject) => {
      ws.once('open', () => resolve())
      ws.once('error', err => reject(new SioError(`ws: ${err.message}`)))
    })
    ws.on('message', data => this.handleFrame(data.toString()))
    ws.on('close', () => {
      this.stopTimers()
      this.failPendingAcks(new SioError('соединение закрыто'))
      this.onDisconnect?.(this.closedByUs ? 'local' : 'remote')
    })
    ws.on('error', () => {
      /* за error всегда следует close */
    })
    this.armWatchdog()
  }

  close(): void {
    this.closedByUs = true
    this.stopTimers()
    try {
      this.ws?.close()
    } catch {
      /* ignore */
    }
  }

  /** Событие без подтверждения. */
  emit(name: string, args: unknown[]): void {
    this.send(`5:::${JSON.stringify({ name, args })}`)
  }

  /** Событие с подтверждением (ack). Возвращает массив аргументов колбэка. */
  emitWithAck(name: string, args: unknown[]): Promise<unknown[]> {
    const id = ++this.msgId
    const frame = `5:${id}+::${JSON.stringify({ name, args })}`
    return new Promise<unknown[]>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.acks.delete(id)
        reject(new SioError(`нет ответа на «${name}»`))
      }, this.opts.ackTimeoutMs ?? 15_000)
      this.acks.set(id, { resolve, reject, timer })
      try {
        this.send(frame)
      } catch (err) {
        clearTimeout(timer)
        this.acks.delete(id)
        reject(err as Error)
      }
    })
  }

  // ---------- внутреннее ----------

  private send(frame: string): void {
    if (!this.isOpen) throw new SioError('сокет не подключён')
    this.ws!.send(frame)
  }

  private stopTimers(): void {
    if (this.watchdog) clearTimeout(this.watchdog)
    this.watchdog = undefined
  }

  private failPendingAcks(err: Error): void {
    for (const [, pending] of this.acks) {
      clearTimeout(pending.timer)
      pending.reject(err)
    }
    this.acks.clear()
  }

  private armWatchdog(): void {
    if (this.watchdog) clearTimeout(this.watchdog)
    // сервер шлёт heartbeat каждые ~heartbeatSec/2; молчание дольше — обрыв
    this.watchdog = setTimeout(
      () => {
        try {
          this.ws?.terminate()
        } catch {
          /* ignore */
        }
      },
      (this.heartbeatSec + 15) * 1000
    )
  }

  private handleFrame(frame: string): void {
    this.armWatchdog()
    // формат: тип:id:endpoint:данные (данные могут содержать двоеточия)
    const type = frame[0]
    const i1 = frame.indexOf(':')
    const i2 = frame.indexOf(':', i1 + 1)
    const i3 = frame.indexOf(':', i2 + 1)
    const data = i3 >= 0 ? frame.slice(i3 + 1) : ''

    switch (type) {
      case '1': // connected
        this.onConnect?.()
        break
      case '2': // heartbeat — отвечаем тем же
        try {
          this.send('2::')
        } catch {
          /* ignore */
        }
        break
      case '5': {
        // событие от сервера
        try {
          const payload = JSON.parse(data) as { name: string; args?: unknown[] }
          this.onEvent?.(payload.name, payload.args ?? [])
        } catch {
          /* некорректный кадр — пропустить */
        }
        break
      }
      case '6': {
        // ack: данные вида "<id>+<jsonArgsArray>" или просто "<id>"
        const plus = data.indexOf('+')
        const idStr = plus >= 0 ? data.slice(0, plus) : data
        const id = parseInt(idStr, 10)
        const pending = this.acks.get(id)
        if (!pending) break
        this.acks.delete(id)
        clearTimeout(pending.timer)
        let args: unknown[] = []
        if (plus >= 0) {
          try {
            args = JSON.parse(data.slice(plus + 1)) as unknown[]
          } catch {
            args = []
          }
        }
        pending.resolve(args)
        break
      }
      case '7': // ошибка протокола
        this.onEvent?.('protocolError', [data])
        break
      case '0': // сервер закрывает соединение
        try {
          this.ws?.close()
        } catch {
          /* ignore */
        }
        break
      default:
        break
    }
  }
}
