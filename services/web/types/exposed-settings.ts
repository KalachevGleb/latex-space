type TemplateLink = {
  name: string
  url: string
  trackingKey: string
}

export type ExposedSettings = {
  adminEmail: string
  appName: string
  cookieDomain: string
  dropboxAppName: string
  emailConfirmationDisabled: boolean
  gaToken?: string
  gaTokenV4?: string
  hasLinkUrlFeature: boolean
  hasLinkedProjectFileFeature: boolean
  hasLinkedProjectOutputFileFeature: boolean
  hotjarId?: string
  hotjarVersion?: string
  ieeeBrandId: number
  isOverleaf: boolean
  maxEntitiesPerProject: number
  projectUploadTimeout: number
  propensityId?: string
  maxUploadSize: number
  recaptchaDisabled: {
    invite: boolean
    login: boolean
    passwordReset: boolean
    register: boolean
    addEmail: boolean
  }
  recaptchaSiteKeyV3?: string
  recaptchaSiteKey?: string
  sentryAllowedOriginRegex: string
  sentryDsn?: string
  sentryEnvironment?: string
  sentryRelease?: string
  siteUrl: string
  textExtensions: string[]
  editableFilenames: string[]
  validRootDocExtensions: string[]
  fileIgnorePattern: string
  templateLinks?: TemplateLink[]
  labsEnabled: boolean
  wikiEnabled?: boolean
  templatesEnabled?: boolean
  peerReviewMode?: boolean
  userHasFullPermissions?: boolean
}
