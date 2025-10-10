/**
 * Конфигурация математических символов для панели
 * 
 * Каждая группа содержит:
 * - id: уникальный идентификатор группы
 * - title: название группы (отображается в заголовке)
 * - symbols: массив символов с полями:
 *   - id: уникальный идентификатор символа
 *   - label: отображаемый символ (как выглядит визуально)
 *   - command: LaTeX команда для вставки
 */

export interface SymbolConfig {
  id: string
  label: string
  command: string
}

export interface SymbolGroup {
  id: string
  title: string
  symbols: SymbolConfig[]
}

export const SYMBOL_GROUPS: SymbolGroup[] = [
  {
    id: 'operators',
    title: 'Операторы',
    symbols: [
      { id: 'plus', label: '+', command: '+' },
      { id: 'minus', label: '−', command: '-' },
      { id: 'times', label: '×', command: '\\times ' },
      { id: 'cdot', label: '·', command: '\\cdot ' },
      { id: 'div', label: '÷', command: '\\div ' },
      { id: 'pm', label: '±', command: '\\pm ' },
      { id: 'mp', label: '∓', command: '\\mp ' },
      { id: 'ast', label: '∗', command: '\\ast ' },
      { id: 'star', label: '⋆', command: '\\star ' },
      { id: 'circ', label: '∘', command: '\\circ ' },
      { id: 'bullet', label: '•', command: '\\bullet ' },
      { id: 'oplus', label: '⊕', command: '\\oplus ' },
      { id: 'ominus', label: '⊖', command: '\\ominus ' },
      { id: 'otimes', label: '⊗', command: '\\otimes ' },
      { id: 'oslash', label: '⊘', command: '\\oslash ' },
      { id: 'sum', label: '∑', command: '\\sum ' },
      { id: 'prod', label: '∏', command: '\\prod ' },
      { id: 'coprod', label: '∐', command: '\\coprod ' },
      { id: 'int', label: '∫', command: '\\int ' },
      { id: 'oint', label: '∮', command: '\\oint ' },
      { id: 'bigcap', label: '⋂', command: '\\bigcap ' },
      { id: 'bigcup', label: '⋃', command: '\\bigcup ' },
    ],
  },
  {
    id: 'relations',
    title: 'Сравнения',
    symbols: [
      { id: 'eq', label: '=', command: '=' },
      { id: 'neq', label: '≠', command: '\\neq ' },
      { id: 'lt', label: '<', command: '<' },
      { id: 'gt', label: '>', command: '>' },
      { id: 'leq', label: '≤', command: '\\leq ' },
      { id: 'geq', label: '≥', command: '\\geq ' },
      { id: 'll', label: '≪', command: '\\ll ' },
      { id: 'gg', label: '≫', command: '\\gg ' },
      { id: 'equiv', label: '≡', command: '\\equiv ' },
      { id: 'approx', label: '≈', command: '\\approx ' },
      { id: 'cong', label: '≅', command: '\\cong ' },
      { id: 'simeq', label: '≃', command: '\\simeq ' },
      { id: 'sim', label: '∼', command: '\\sim ' },
      { id: 'propto', label: '∝', command: '\\propto ' },
      { id: 'asymp', label: '≍', command: '\\asymp ' },
      { id: 'doteq', label: '≐', command: '\\doteq ' },
    ],
  },
  {
    id: 'arrows',
    title: 'Стрелки',
    symbols: [
      { id: 'leftarrow', label: '←', command: '\\leftarrow ' },
      { id: 'rightarrow', label: '→', command: '\\rightarrow ' },
      { id: 'uparrow', label: '↑', command: '\\uparrow ' },
      { id: 'downarrow', label: '↓', command: '\\downarrow ' },
      { id: 'leftrightarrow', label: '↔', command: '\\leftrightarrow ' },
      { id: 'updownarrow', label: '↕', command: '\\updownarrow ' },
      { id: 'Leftarrow', label: '⇐', command: '\\Leftarrow ' },
      { id: 'Rightarrow', label: '⇒', command: '\\Rightarrow ' },
      { id: 'Uparrow', label: '⇑', command: '\\Uparrow ' },
      { id: 'Downarrow', label: '⇓', command: '\\Downarrow ' },
      { id: 'Leftrightarrow', label: '⇔', command: '\\Leftrightarrow ' },
      { id: 'Updownarrow', label: '⇕', command: '\\Updownarrow ' },
      { id: 'mapsto', label: '↦', command: '\\mapsto ' },
      { id: 'longmapsto', label: '⟼', command: '\\longmapsto ' },
      { id: 'longleftarrow', label: '⟵', command: '\\longleftarrow ' },
      { id: 'longrightarrow', label: '⟶', command: '\\longrightarrow ' },
      { id: 'longleftrightarrow', label: '⟷', command: '\\longleftrightarrow ' },
      { id: 'Longleftarrow', label: '⟸', command: '\\Longleftarrow ' },
      { id: 'Longrightarrow', label: '⟹', command: '\\Longrightarrow ' },
      { id: 'Longleftrightarrow', label: '⟺', command: '\\Longleftrightarrow ' },
      { id: 'nearrow', label: '↗', command: '\\nearrow ' },
      { id: 'searrow', label: '↘', command: '\\searrow ' },
      { id: 'swarrow', label: '↙', command: '\\swarrow ' },
      { id: 'nwarrow', label: '↖', command: '\\nwarrow ' },
    ],
  },
  {
    id: 'greek-lower',
    title: 'Греческие (строчные)',
    symbols: [
      { id: 'alpha', label: 'α', command: '\\alpha ' },
      { id: 'beta', label: 'β', command: '\\beta ' },
      { id: 'gamma', label: 'γ', command: '\\gamma ' },
      { id: 'delta', label: 'δ', command: '\\delta ' },
      { id: 'epsilon', label: 'ε', command: '\\epsilon ' },
      { id: 'varepsilon', label: 'ϵ', command: '\\varepsilon ' },
      { id: 'zeta', label: 'ζ', command: '\\zeta ' },
      { id: 'eta', label: 'η', command: '\\eta ' },
      { id: 'theta', label: 'θ', command: '\\theta ' },
      { id: 'vartheta', label: 'ϑ', command: '\\vartheta ' },
      { id: 'iota', label: 'ι', command: '\\iota ' },
      { id: 'kappa', label: 'κ', command: '\\kappa ' },
      { id: 'lambda', label: 'λ', command: '\\lambda ' },
      { id: 'mu', label: 'μ', command: '\\mu ' },
      { id: 'nu', label: 'ν', command: '\\nu ' },
      { id: 'xi', label: 'ξ', command: '\\xi ' },
      { id: 'pi', label: 'π', command: '\\pi ' },
      { id: 'varpi', label: 'ϖ', command: '\\varpi ' },
      { id: 'rho', label: 'ρ', command: '\\rho ' },
      { id: 'varrho', label: 'ϱ', command: '\\varrho ' },
      { id: 'sigma', label: 'σ', command: '\\sigma ' },
      { id: 'varsigma', label: 'ς', command: '\\varsigma ' },
      { id: 'tau', label: 'τ', command: '\\tau ' },
      { id: 'upsilon', label: 'υ', command: '\\upsilon ' },
      { id: 'phi', label: 'φ', command: '\\phi ' },
      { id: 'varphi', label: 'ϕ', command: '\\varphi ' },
      { id: 'chi', label: 'χ', command: '\\chi ' },
      { id: 'psi', label: 'ψ', command: '\\psi ' },
      { id: 'omega', label: 'ω', command: '\\omega ' },
    ],
  },
  {
    id: 'greek-upper',
    title: 'Греческие (заглавные)',
    symbols: [
      { id: 'Gamma', label: 'Γ', command: '\\Gamma ' },
      { id: 'Delta', label: 'Δ', command: '\\Delta ' },
      { id: 'Theta', label: 'Θ', command: '\\Theta ' },
      { id: 'Lambda', label: 'Λ', command: '\\Lambda ' },
      { id: 'Xi', label: 'Ξ', command: '\\Xi ' },
      { id: 'Pi', label: 'Π', command: '\\Pi ' },
      { id: 'Sigma', label: 'Σ', command: '\\Sigma ' },
      { id: 'Upsilon', label: 'Υ', command: '\\Upsilon ' },
      { id: 'Phi', label: 'Φ', command: '\\Phi ' },
      { id: 'Psi', label: 'Ψ', command: '\\Psi ' },
      { id: 'Omega', label: 'Ω', command: '\\Omega ' },
    ],
  },
  {
    id: 'sets',
    title: 'Множества',
    symbols: [
      { id: 'in', label: '∈', command: '\\in ' },
      { id: 'notin', label: '∉', command: '\\notin ' },
      { id: 'ni', label: '∋', command: '\\ni ' },
      { id: 'subset', label: '⊂', command: '\\subset ' },
      { id: 'supset', label: '⊃', command: '\\supset ' },
      { id: 'subseteq', label: '⊆', command: '\\subseteq ' },
      { id: 'supseteq', label: '⊇', command: '\\supseteq ' },
      { id: 'cap', label: '∩', command: '\\cap ' },
      { id: 'cup', label: '∪', command: '\\cup ' },
      { id: 'emptyset', label: '∅', command: '\\emptyset ' },
      { id: 'varnothing', label: '∅', command: '\\varnothing ' },
      { id: 'setminus', label: '∖', command: '\\setminus ' },
    ],
  },
  {
    id: 'logic',
    title: 'Логика',
    symbols: [
      { id: 'forall', label: '∀', command: '\\forall ' },
      { id: 'exists', label: '∃', command: '\\exists ' },
      { id: 'nexists', label: '∄', command: '\\nexists ' },
      { id: 'neg', label: '¬', command: '\\neg ' },
      { id: 'land', label: '∧', command: '\\land ' },
      { id: 'lor', label: '∨', command: '\\lor ' },
      { id: 'top', label: '⊤', command: '\\top ' },
      { id: 'bot', label: '⊥', command: '\\bot ' },
      { id: 'vdash', label: '⊢', command: '\\vdash ' },
      { id: 'models', label: '⊨', command: '\\models ' },
    ],
  },
  {
    id: 'misc',
    title: 'Разное',
    symbols: [
      { id: 'infty', label: '∞', command: '\\infty ' },
      { id: 'partial', label: '∂', command: '\\partial ' },
      { id: 'nabla', label: '∇', command: '\\nabla ' },
      { id: 'angle', label: '∠', command: '\\angle ' },
      { id: 'triangle', label: '△', command: '\\triangle ' },
      { id: 'square', label: '□', command: '\\square ' },
      { id: 'diamond', label: '◊', command: '\\diamond ' },
      { id: 'ell', label: 'ℓ', command: '\\ell ' },
      { id: 'hbar', label: 'ℏ', command: '\\hbar ' },
      { id: 'aleph', label: 'ℵ', command: '\\aleph ' },
      { id: 'wp', label: '℘', command: '\\wp ' },
      { id: 'Re', label: 'ℜ', command: '\\Re ' },
      { id: 'Im', label: 'ℑ', command: '\\Im ' },
      { id: 'prime', label: '′', command: '\\prime ' },
      { id: 'dots', label: '…', command: '\\dots ' },
      { id: 'cdots', label: '⋯', command: '\\cdots ' },
      { id: 'vdots', label: '⋮', command: '\\vdots ' },
      { id: 'ddots', label: '⋱', command: '\\ddots ' },
    ],
  },
]

