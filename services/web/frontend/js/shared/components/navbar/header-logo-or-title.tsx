import type { DefaultNavbarMetadata } from '@/shared/components/types/default-navbar-metadata'
import getMeta from '@/utils/meta'

export default function HeaderLogoOrTitle({
  overleafLogo,
  customLogo,
  title,
}: Pick<DefaultNavbarMetadata, 'customLogo' | 'title'> & {
  overleafLogo?: string
}) {
  const { appName } = getMeta('ol-ExposedSettings')
  const logoUrl = customLogo ?? overleafLogo
  return (
    <a href="/" aria-label={appName} className="navbar-brand">
      {(customLogo || !title) && (
        <div
          className="navbar-logo"
          style={logoUrl ? { backgroundImage: `url("${logoUrl}")` } : {}}
        />
      )}
      {title && (
        <div className="navbar-title">
          {!customLogo && (
            <span className="navbar-title-mark" aria-hidden="true" />
          )}
          <span>{title}</span>
        </div>
      )}
    </a>
  )
}
