import moment from 'moment'
import 'moment/locale/ru'
import getMeta from '@/utils/meta'

// Set moment locale based on the current language
const LANG = getMeta('ol-i18n', { currentLangCode: 'en' }).currentLangCode
moment.locale(LANG)

export function formatDate(date: moment.MomentInput, format?: string) {
  if (!date) return 'N/A'
  if (format == null) {
    format = 'Do MMM YYYY, h:mm a'
  }
  return moment(date).format(format)
}

export function fromNowDate(date: moment.MomentInput | string) {
  return moment(date).fromNow()
}
