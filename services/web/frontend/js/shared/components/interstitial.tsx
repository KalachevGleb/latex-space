import classNames from 'classnames'
import latexspaceLogo from '@/shared/svgs/latexspace-logo.svg'
import getMeta from '@/utils/meta'

type InterstitialProps = {
  className?: string
  contentClassName?: string
  children: React.ReactNode
  showLogo: boolean
  title?: string
}

export function Interstitial({
  className,
  contentClassName,
  children,
  showLogo,
  title,
}: InterstitialProps) {
  const { appName } = getMeta('ol-ExposedSettings')
  return (
    <div className={classNames('interstitial', className)}>
      {showLogo && <img className="logo" src={latexspaceLogo} alt={appName} />}
      {title && <h1 className="h3 interstitial-header">{title}</h1>}
      <div className={classNames(contentClassName)}>{children}</div>
    </div>
  )
}
