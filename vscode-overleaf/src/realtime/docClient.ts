import { applyOp, composeOp, TextOp, transformOp } from './textOt'

export interface OtUpdate {
  doc: string
  v: number
  op?: TextOp
  meta?: {
    source?: string
    user_id?: string
    type?: string
    /** seed идентификаторов track changes */
    tc?: string
    ts?: number | string
  }
  dup?: boolean
}

/**
 * Клиентская модель одного документа (state machine ShareJS):
 * text/version — подтверждённое состояние + наши неподтверждённые операции.
 * За раз в полёте не больше одной операции; остальные копятся в буфере.
 */
export class OtDoc {
  /** текст с учётом всех локальных (в т.ч. неподтверждённых) операций */
  text: string
  /** версия сервера, на которой основана inflight-операция */
  version: number
  private inflight?: TextOp
  private buffer: TextOp = []

  /** отправка операции на сервер */
  onSend?: (update: {
    doc: string
    op: TextOp
    v: number
    meta?: { tc?: string }
  }) => void
  /** вызывается при переходе новой операции в inflight (для tc-seed) */
  onFlip?: () => void
  /** требуется полная пересинхронизация документа */
  onNeedResync?: (reason: string) => void

  constructor(
    readonly docId: string,
    initialText: string,
    initialVersion: number
  ) {
    this.text = initialText
    this.version = initialVersion
  }

  hasPending(): boolean {
    return !!this.inflight || this.buffer.length > 0
  }

  /** Локальное изменение (уже применено к редактору). */
  localChange(op: TextOp): void {
    if (op.length === 0) return
    this.text = applyOp(this.text, op)
    if (this.inflight) {
      this.buffer = composeOp(this.buffer, op)
    } else {
      this.inflight = op
      this.onFlip?.()
      this.send()
    }
  }

  private send(): void {
    if (!this.inflight) return
    this.onSend?.({ doc: this.docId, op: this.inflight, v: this.version })
  }

  /** Повторная отправка inflight после переподключения. */
  resend(): void {
    this.send()
  }

  /**
   * Входящее сообщение otUpdateApplied.
   * Возвращает операцию, которую нужно применить к буферу редактора
   * (уже преобразованную относительно наших локальных операций), либо null.
   */
  handleUpdate(update: OtUpdate, myPublicId: string): TextOp | null {
    const isAck =
      !update.op ||
      update.dup ||
      (update.meta?.source && update.meta.source === myPublicId)

    if (isAck) {
      // подтверждение нашей операции
      if (!this.inflight) {
        // ack без inflight — рассинхрон
        if (update.v >= this.version) {
          this.onNeedResync?.('ack без ожидающей операции')
        }
        return null
      }
      if (update.v < this.version) return null // устаревший дубль
      this.version = update.v + 1
      this.inflight = undefined
      if (this.buffer.length > 0) {
        this.inflight = this.buffer
        this.buffer = []
        this.onFlip?.()
        this.send()
      }
      return null
    }

    // чужая операция
    if (update.v < this.version) return null // уже учтена
    if (update.v > this.version) {
      this.onNeedResync?.(
        `пропуск версий (ожидали ${this.version}, пришла ${update.v})`
      )
      return null
    }
    let op = update.op!
    if (this.inflight) {
      const newInflight = transformOp(this.inflight, op, 'left')
      op = transformOp(op, this.inflight, 'right')
      this.inflight = newInflight
    }
    if (this.buffer.length > 0) {
      const newBuffer = transformOp(this.buffer, op, 'left')
      op = transformOp(op, this.buffer, 'right')
      this.buffer = newBuffer
    }
    this.text = applyOp(this.text, op)
    this.version = update.v + 1
    return op
  }
}
