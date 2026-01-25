import { User, Features } from '../../../types/user'
import { User as MinimalUser } from '../../../types/admin/user'
import { User as ManagedUser } from '../../../types/group-management/user'
import { UserSettings } from '../../../types/user-settings'
import { ExposedSettings } from '../../../types/exposed-settings'
import {
  type ImageName,
  OverallThemeMeta,
  type SpellCheckLanguage,
} from '../../../types/project-settings'
import type { PortalTemplate } from '../../../types/portal-template'
import { UserEmailData } from '../../../types/user-email'
import {
  GroupsAndEnterpriseBannerVariant,
  Notification as NotificationType,
  USGovBannerVariant,
} from '../../../types/project/dashboard/notification'
import { Survey } from '../../../types/project/dashboard/survey'
import { GetProjectsResponseBody } from '../../../types/project/dashboard/api'
import { Tag } from '../../../app/src/Features/Tags/types'
import { SplitTestInfo } from '../../../types/split-test'
import { ValidationStatus } from '../../../types/group-management/validation'
import { OnboardingFormData } from '../../../types/onboarding'
import { AccessToken } from '../../../types/settings-page'
import { SuggestedLanguage } from '../../../types/system-message'
import type { TeamInvite } from '../../../types/team-invite'
import { PasswordStrengthOptions } from '../../../types/password-strength-options'
import { DefaultNavbarMetadata } from '@/shared/components/types/default-navbar-metadata'
import { FooterMetadata } from '@/shared/components/types/footer-metadata'
import type { ScriptLogType } from '../../../modules/admin-panel/frontend/js/features/script-logs/script-log'
import { ActiveExperiment } from './labs-utils'
import { AdminCapability } from '../../../types/admin-capabilities'
import { AlgoliaConfig } from '../../../modules/algolia-search/frontend/js/types'
import { WritefullPublicEnv } from '@wf/domain/writefull-public-env'

export interface Meta {
  'ol-ExposedSettings': ExposedSettings
  'ol-adminCapabilities': AdminCapability[]
  'ol-aiAssistViaWritefullSource': string
  'ol-algolia': AlgoliaConfig | undefined
  'ol-allInReconfirmNotificationPeriods': UserEmailData[]
  'ol-allowedExperiments': string[]
  'ol-anonymous': boolean
  'ol-baseAssetPath': string
  'ol-brandVariation': Record<string, any>

  // dynamic keys based on permissions
  'ol-cannot-add-secondary-email': boolean
  'ol-cannot-change-password': boolean
  'ol-cannot-delete-own-account': boolean
  'ol-cannot-use-ai': boolean
  'ol-capabilities': Array<'dropbox' | 'chat' | 'use-ai' | 'link-sharing'>
  'ol-compileSettings': {
    compileTimeout: number
  }
  'ol-compilesUserContentDomain': string
  'ol-countryCode': string
  'ol-couponCode': string
  'ol-createdAt': Date
  'ol-csrfToken': string
  'ol-currentManagedUserAdminEmail': string
  'ol-currentUrl': string
  'ol-customerIoEnabled': boolean
  'ol-debugPdfDetach': boolean
  'ol-detachRole': 'detached' | 'detacher' | ''
  'ol-dictionariesRoot': 'string'
  'ol-dropbox': { error: boolean; registered: boolean }
  'ol-editorThemes': string[]
  'ol-email': string
  'ol-emailAddressLimit': number
  'ol-error': { name: string } | undefined
  'ol-expired': boolean
  'ol-features': Features
  'ol-footer': FooterMetadata
  'ol-galleryTagName': string
  'ol-gitBridgeEnabled': boolean
  'ol-gitBridgePublicBaseUrl': string
  'ol-github': { enabled: boolean; error: boolean }
  'ol-groupAuditLogs': []
  'ol-groupId': string
  'ol-groupName': string
  'ol-groupPolicy': unknown
  'ol-groupSettingsAdvertisedFor': string[]
  'ol-groupSettingsEnabledFor': string[]
  'ol-groupSize': number
  'ol-groupsAndEnterpriseBannerVariant': GroupsAndEnterpriseBannerVariant
  'ol-hasAiAssistViaWritefull': boolean
  'ol-hasManagedUsersFeature': boolean
  'ol-hasModifyGroupManagerAccess': boolean
  'ol-hasPassword': boolean
  'ol-hasSplitTestWriteAccess': boolean
  'ol-hasTrackChangesFeature': boolean
  'ol-hasWriteAccess': boolean
  'ol-hideLinkingWidgets': boolean // CI only
  'ol-historyBlobStats': {
    projectId: string
    textBlobsBytes: number
    binaryBlobsBytes: number
    totalBytes: number
    nTextBlobs: number
    nBinaryBlobs: number
    owned?: boolean
  }[]
  'ol-i18n': { currentLangCode: string }
  'ol-imageNames': ImageName[]
  'ol-inactiveTutorials': string[]
  'ol-inviteToken': string
  'ol-inviterName': string
  'ol-isExternalAuthenticationSystemUsed': boolean
  'ol-isManagedAccount': boolean
  'ol-isRestrictedTokenMember': boolean
  'ol-isSaas': boolean
  'ol-isUserGroupManager': boolean
  'ol-itm_campaign': string
  'ol-itm_content': string
  'ol-itm_referrer': string
  'ol-labs': boolean
  'ol-labsExperiments': ActiveExperiment[] | undefined
  'ol-languages': SpellCheckLanguage[]
  'ol-learnedWords': string[]
  'ol-legacyEditorThemes': string[]
  'ol-loadingText': string
  'ol-managedUsersActive': boolean
  'ol-managedUsersEnabled': boolean
  'ol-managers': MinimalUser[]
  'ol-mathJaxPath': string
  'ol-maxDocLength': number
  'ol-maxReconnectGracefullyIntervalMs': number
  'ol-members': MinimalUser[]
  'ol-navbar': DefaultNavbarMetadata
  'ol-no-single-dollar': boolean
  'ol-notifications': NotificationType[]
  'ol-odcData': OnboardingFormData
  'ol-otMigrationStage': number
  'ol-overallThemes': OverallThemeMeta[]
  'ol-pages': number
  'ol-passwordStrengthOptions': PasswordStrengthOptions
  'ol-personalAccessTokens': AccessToken[] | undefined
  'ol-portalTemplates': PortalTemplate[]
  'ol-postUrl': string
  'ol-prefetchedProjectsBlob': GetProjectsResponseBody | undefined
  'ol-preventCompileOnLoad'?: boolean
  'ol-primaryEmail': { email: string; confirmed: boolean }
  'ol-project': any // TODO
  'ol-projectEntityCounts': { files: number; docs: number }
  'ol-projectName': string
  'ol-projectOwnerHasPremiumOnPageLoad': boolean
  'ol-projectSyncSuccessMessage': string
  'ol-projectTags': Tag[]
  'ol-project_id': string
  'ol-recommendedCurrency': string
  'ol-reconfirmationRemoveEmail': string
  'ol-ro-mirror-on-client-no-local-storage': boolean
  'ol-script-log': ScriptLogType
  'ol-script-logs': ScriptLogType[]
  'ol-shouldAllowEditingDetails': boolean
  'ol-shouldLoadHotjar': boolean
  'ol-showAiErrorAssistant': boolean
  'ol-showBrlGeoBanner': boolean
  'ol-showCouponField': boolean
  'ol-showFilters': boolean
  'ol-showGroupDiscount': boolean
  'ol-showGroupsAndEnterpriseBanner': boolean
  'ol-showInrGeoBanner': boolean
  'ol-showLATAMBanner': boolean
  'ol-showSupport': boolean
  'ol-showSymbolPalette': boolean
  'ol-showTemplatesServerPro': boolean
  'ol-showUSGovBanner': boolean
  'ol-showUpgradePrompt': boolean
  'ol-splitTestInfo': { [name: string]: SplitTestInfo }
  'ol-splitTestName': string
  'ol-splitTestVariants': { [name: string]: string }
  'ol-stripeAccountId': string
  'ol-stripePublicKeyUK': string
  'ol-stripePublicKeyUS': string
  'ol-suggestedLanguage': SuggestedLanguage | undefined
  'ol-survey': Survey | undefined
  'ol-symbolPaletteAvailable': boolean
  'ol-tags': Tag[]
  'ol-teamInvites': TeamInvite[]
  'ol-totalLicenses': number
  'ol-translationIoNotLoaded': string
  'ol-translationLoadErrorMessage': string
  'ol-translationMaintenance': string
  'ol-translationUnableToJoin': string
  'ol-usGovBannerVariant': USGovBannerVariant
  'ol-useShareJsHash': boolean
  'ol-user': User
  'ol-userCanExtendTrial': boolean
  'ol-userCanNotStartRequestedTrial': boolean
  'ol-userEmails': UserEmailData[]
  'ol-userSettings': UserSettings
  'ol-user_id': string | undefined
  'ol-users': ManagedUser[]
  'ol-usersEmail': string | undefined
  'ol-validationStatus': ValidationStatus
  'ol-viaDomainCapture': boolean
  'ol-wikiEnabled': boolean
  'ol-writefullEnabled': boolean
  'ol-writefullEnv': WritefullPublicEnv
  'ol-wsUrl': string
}

type DeepPartial<T> =
  T extends Record<string, any> ? { [P in keyof T]?: DeepPartial<T[P]> } : T

export type PartialMeta = DeepPartial<Meta>

export type MetaAttributesCache<
  K extends keyof PartialMeta = keyof PartialMeta,
> = Map<K, PartialMeta[K]>

export type MetaTag = {
  [K in keyof Meta]: {
    name: K
    value: Meta[K]
  }
}[keyof Meta]

// cache for parsed values
window.metaAttributesCache = window.metaAttributesCache || new Map()

export default function getMeta<T extends keyof Meta>(name: T): Meta[T] {
  if (window.metaAttributesCache.has(name)) {
    return window.metaAttributesCache.get(name)
  }
  const element = document.head.querySelector(
    `meta[name="${name}"]`
  ) as HTMLMetaElement
  if (!element) {
    return undefined!
  }
  const plainTextValue = element.content
  let value
  switch (element.dataset.type) {
    case 'boolean':
      // in pug: content=false -> no content field
      // in pug: content=true  -> empty content field
      value = element.hasAttribute('content')
      break
    case 'json':
    case 'number':
      if (!plainTextValue) {
        // JSON.parse('') throws
        value = undefined
      } else {
        value = JSON.parse(plainTextValue)
      }
      break
    default:
      value = plainTextValue
  }
  window.metaAttributesCache.set(name, value)
  return value
}
