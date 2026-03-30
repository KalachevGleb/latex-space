import ProjectEntityHandler from '../Project/ProjectEntityHandler.js'
import DocumentUpdaterHandler from '../DocumentUpdater/DocumentUpdaterHandler.js'
import packageMapping from './packageMapping.mjs'
import { callbackify } from '@overleaf/promise-utils'
import path from 'path'

/** @typedef {{
 *   labels: string[]
 *   packages: Record<string, Record<string, any>>,
 *   packageNames: string[],
 *   bibitems: string[],
 *   macros: string[],
 *   environments: string[],
 * }} DocMeta
 */

/**
 * @param {string[]} lines
 * @return {Promise<DocMeta>}
 */
async function extractMetaFromDoc(lines) {
  /** @type {DocMeta} */
  const docMeta = {
    labels: [],
    packages: {},
    packageNames: [],
    bibitems: [],
    macros: [],
    environments: [],
  }

  const labelRe = /\\label{(.{0,80}?)}/g
  const labelOptionRe = /\blabel={?(.{0,80}?)[\s},\]]/g
  const bibitemRe = /\\[BR]?[Bb]ibitem{(.{0,80}?)}/g
  const packageRe = /^\\usepackage(?:\[.{0,80}?])?{(.{0,80}?)}/g
  const reqPackageRe = /^\\RequirePackage(?:\[.{0,80}?])?{(.{0,80}?)}/g
  // Regex for \newcommand, \renewcommand, and \def
  const newCommandRe = /\\(?:newcommand|renewcommand)\*?{?(\\[a-zA-Z@]+)}?/g
  const defRe = /\\def(\\[a-zA-Z@]+)/g
  const newEnvironmentRe =
    /\\(?:newenvironment|renewenvironment)\*?\s*{([^}]{1,80})}/g
  const newTheoremRe = /\\newtheorem\*?\s*{([^}]{1,80})}/g

  for (const rawLine of lines) {
    const line = getNonCommentedContent(rawLine)

    for (const label of lineMatches(labelRe, line)) {
      docMeta.labels.push(label)
    }

    for (const label of lineMatches(labelOptionRe, line)) {
      docMeta.labels.push(label)
    }

    for (const bibitem of lineMatches(bibitemRe, line)) {
      docMeta.bibitems.push(bibitem)
    }

    for (const pkg of lineMatches(packageRe, line, ',')) {
      docMeta.packageNames.push(pkg)
    }

    for (const pkg of lineMatches(reqPackageRe, line, ',')) {
      docMeta.packageNames.push(pkg)
    }

    for (const macro of lineMatches(newCommandRe, line)) {
      if (isPublicLatexName(macro) && !docMeta.macros.includes(macro)) {
        docMeta.macros.push(macro)
      }
    }

    for (const macro of lineMatches(defRe, line)) {
      if (isPublicLatexName(macro) && !docMeta.macros.includes(macro)) {
        docMeta.macros.push(macro)
      }
    }

    for (const environmentName of lineMatches(newEnvironmentRe, line)) {
      if (
        isPublicLatexName(environmentName) &&
        !docMeta.environments.includes(environmentName)
      ) {
        docMeta.environments.push(environmentName)
      }
    }

    for (const theoremName of lineMatches(newTheoremRe, line)) {
      if (
        isPublicLatexName(theoremName) &&
        !docMeta.environments.includes(theoremName)
      ) {
        docMeta.environments.push(theoremName)
      }
    }
  }

  for (const packageName of docMeta.packageNames) {
    if (packageMapping[packageName]) {
      docMeta.packages[packageName] = packageMapping[packageName]
    }
  }

  return docMeta
}

/**
 *
 * @param {RegExp} matchRe
 * @param {string} line
 * @param {string} [separator]
 * @return {Generator<string>}
 */
function* lineMatches(matchRe, line, separator) {
  let match
  while ((match = matchRe.exec(line))) {
    const matched = match[1].trim()

    if (matched) {
      if (separator) {
        const items = matched
          .split(',')
          .map(item => item.trim())
          .filter(Boolean)

        for (const item of items) {
          yield item
        }
      } else {
        yield matched
      }
    }
  }
}

/**
 * @param {Record<{ lines: string[] }, any>} projectDocs
 * @return {Promise<{}>}
 */
async function extractMetaFromProjectDocs(projectDocs) {
  const projectMeta = {}
  for (const [docPath, doc] of Object.entries(projectDocs)) {
    const docMeta = await extractMetaFromDoc(doc.lines)

    if (isClassOrStyleFile(docPath)) {
      docMeta.bibitems = []
    }

    projectMeta[doc._id] = docMeta
  }
  return projectMeta
}

/**
 * @param {string} docPath
 * @returns {boolean}
 */
function isClassOrStyleFile(docPath) {
  const extension = path.extname(docPath).toLowerCase()
  return extension === '.cls' || extension === '.sty'
}

/**
 * @param {string} value
 * @returns {boolean}
 */
function isPublicLatexName(value) {
  return !value.includes('@')
}

/**
 * Trims comment content from line
 * @param {string} rawLine
 * @returns {string}
 */
function getNonCommentedContent(rawLine) {
  return rawLine.replace(/(^|[^\\])%.*/, '$1')
}

async function getAllMetaForProject(projectId) {
  await DocumentUpdaterHandler.promises.flushProjectToMongo(projectId)

  const docs = await ProjectEntityHandler.promises.getAllDocs(projectId)

  return await extractMetaFromProjectDocs(docs)
}

async function getMetaForDoc(projectId, docId) {
  await DocumentUpdaterHandler.promises.flushDocToMongo(projectId, docId)

  const { lines } = await ProjectEntityHandler.promises.getDoc(projectId, docId)

  return await extractMetaFromDoc(lines)
}

export default {
  promises: {
    getAllMetaForProject,
    getMetaForDoc,
  },
  getAllMetaForProject: callbackify(getAllMetaForProject),
  getMetaForDoc: callbackify(getMetaForDoc),
}
