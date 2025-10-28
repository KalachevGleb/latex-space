import { EditorState } from '@codemirror/state'
import { SyntaxNodeRef } from '@lezer/common'
import { NodeIntersectsChangeFn, ProjectionItem } from './projection'

/**
 * A projection of a bibitem in the document
 */
export class Bibitem extends ProjectionItem {
  readonly key: string = ''
}

/**
 * Extracts Bibitem instances from the syntax tree.
 * Matches \bibitem, \Bibitem, \RBibitem commands
 */
export const enterNode = (
  state: EditorState,
  node: SyntaxNodeRef,
  items: Bibitem[],
  nodeIntersectsChange: NodeIntersectsChangeFn
): any => {
  if (
    node.type.is('UnknownCommand') ||
    node.type.is('KnownCommand') ||
    node.type.is('MathUnknownCommand')
  ) {
    if (!nodeIntersectsChange(node.node)) {
      // This should already be in `items`
      return
    }

    // For KnownCommand, use the first child (CommandName node)
    let commandNode = node.node
    if (node.type.is('KnownCommand')) {
      const firstChild = commandNode.firstChild
      if (!firstChild) {
        return
      }
      commandNode = firstChild
    }

    // Get the command control sequence
    const ctrlSeq = commandNode.getChild('$CtrlSeq')
    if (!ctrlSeq) {
      return
    }

    if (ctrlSeq.type.is('$CtrlSym')) {
      return
    }

    const commandText = state.doc.sliceString(ctrlSeq.from, ctrlSeq.to)

    // Check if this is a bibitem command (case insensitive)
    // Matches: \bibitem, \Bibitem, \RBibitem, \rbibitem, etc.
    if (!/^\\[BR]?[Bb]ibitem$/i.test(commandText)) {
      return
    }

    // Get the first TextArgument (the bibitem key)
    const textArgs = commandNode.getChildren('TextArgument')
    if (textArgs.length === 0) {
      return
    }

    const keyArg = textArgs[0]

    // TextArgument contains LongArg which contains the actual content
    const longArg = keyArg.getChild('LongArg')
    if (!longArg) {
      return
    }

    const key = state.doc.sliceString(longArg.from, longArg.to)
      .replace(/^{|}$/g, '') // Remove surrounding braces if any
      .trim()

    if (key.length === 0) {
      return
    }

    items.push({
      line: state.doc.lineAt(commandNode.from).number,
      key,
      from: commandNode.from,
      to: commandNode.to,
    })
  }
}
