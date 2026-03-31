import { syntaxTree } from '@codemirror/language'
import { EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view'
import { SyntaxNode } from '@lezer/common'

type RememberedEnvironmentPair = {
  beginNameFrom: number
  beginNameTo: number
  endNameFrom: number
  endNameTo: number
}

const rememberedPairs = new WeakMap<EditorView, RememberedEnvironmentPair>()

const findAncestorNodeWithType = (
  node: SyntaxNode | null,
  type: string
): SyntaxNode | null => {
  while (node) {
    if (node.type.is(type)) {
      return node
    }
    node = node.parent
  }
  return null
}

const getEnvNameNode = (node: SyntaxNode | null): SyntaxNode | null => {
  const nameNode = node?.getChild('EnvNameGroup')?.getChild('OpenBrace')
    ?.nextSibling
  if (!nameNode || nameNode.type.is('CloseBrace')) {
    return null
  }
  return nameNode
}

const findEnvironmentPairAtCursor = (
  view: EditorView
): RememberedEnvironmentPair | null => {
  const tree = syntaxTree(view.state)
  const pos = view.state.selection.main.head

  for (const bias of [-1, 1] as const) {
    const resolved = tree.resolveInner(pos, bias)
    const environmentNode = findAncestorNodeWithType(resolved, '$Environment')
    if (!environmentNode) {
      continue
    }

    const beginNode = environmentNode.getChild('BeginEnv')
    const endNode = environmentNode.getChild('EndEnv')
    const beginNameNode = getEnvNameNode(beginNode)
    const endNameNode = getEnvNameNode(endNode)

    if (!beginNode || !endNode || !beginNameNode || !endNameNode) {
      continue
    }

    const onBegin =
      pos >= beginNode.from &&
      pos <= beginNode.to &&
      pos >= beginNameNode.from - 1 &&
      pos <= beginNameNode.to + 1
    const onEnd =
      pos >= endNode.from &&
      pos <= endNode.to &&
      pos >= endNameNode.from - 1 &&
      pos <= endNameNode.to + 1

    if (onBegin || onEnd) {
      return {
        beginNameFrom: beginNameNode.from,
        beginNameTo: beginNameNode.to,
        endNameFrom: endNameNode.from,
        endNameTo: endNameNode.to,
      }
    }
  }

  return null
}

const mapRememberedPair = (
  pair: RememberedEnvironmentPair,
  update: ViewUpdate
): RememberedEnvironmentPair => {
  return {
    beginNameFrom: update.changes.mapPos(pair.beginNameFrom, -1),
    beginNameTo: update.changes.mapPos(pair.beginNameTo, 1),
    endNameFrom: update.changes.mapPos(pair.endNameFrom, -1),
    endNameTo: update.changes.mapPos(pair.endNameTo, 1),
  }
}

export const rememberEnvironmentPair = ViewPlugin.fromClass(
  class {
    constructor(view: EditorView) {
      const pair = findEnvironmentPairAtCursor(view)
      if (pair) {
        rememberedPairs.set(view, pair)
      }
    }

    update(update: ViewUpdate) {
      const existingPair = rememberedPairs.get(update.view)
      if (existingPair && update.docChanged) {
        rememberedPairs.set(update.view, mapRememberedPair(existingPair, update))
      }

      if (update.selectionSet || update.docChanged) {
        const pair = findEnvironmentPairAtCursor(update.view)
        if (pair) {
          rememberedPairs.set(update.view, pair)
        }
      }
    }

    destroy() {
      // WeakMap handles cleanup automatically.
    }
  }
)

export const getRememberedEnvironmentPair = (view: EditorView) =>
  rememberedPairs.get(view)
