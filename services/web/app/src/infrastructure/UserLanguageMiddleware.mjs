import SessionManager from '../Features/Authentication/SessionManager.js'
import { User } from '../models/User.js'
import SystemSettingsManager from '../Features/SystemSettings/SystemSettingsManager.mjs'
import logger from '@overleaf/logger'

/**
 * Middleware to set the user's preferred language or site default language
 * This should be called after the i18n middleware but before setting language based on domain
 */
async function setUserLanguageMiddleware(req, res, next) {
  try {
    const userId = SessionManager.getLoggedInUserId(req.session)
    let languageToSet = null
    
    if (userId) {
      // User is logged in, check their language preference
      const user = await User.findById(userId).select('ace.interfaceLanguage').exec()
      
      if (user && user.ace && user.ace.interfaceLanguage) {
        const userLanguage = user.ace.interfaceLanguage
        
        if (userLanguage === 'default') {
          // User wants to use site default language
          const defaultLanguage = await SystemSettingsManager.promises.getSetting('defaultLanguage')
          if (defaultLanguage && req.i18n.languages.includes(defaultLanguage)) {
            languageToSet = defaultLanguage
          }
        } else if (req.i18n.languages.includes(userLanguage)) {
          // User has a specific language preference
          languageToSet = userLanguage
        }
      } else {
        // User doesn't have a language preference, use site default
        const defaultLanguage = await SystemSettingsManager.promises.getSetting('defaultLanguage')
        if (defaultLanguage && req.i18n.languages.includes(defaultLanguage)) {
          languageToSet = defaultLanguage
        }
      }
    } else {
      // User is not logged in, use site default language
      const defaultLanguage = await SystemSettingsManager.promises.getSetting('defaultLanguage')
      if (defaultLanguage && req.i18n.languages.includes(defaultLanguage)) {
        languageToSet = defaultLanguage
      }
    }
    
    // Apply the language if one was determined
    if (languageToSet) {
      await req.i18n.changeLanguage(languageToSet)
      // Mark that we've set a user-specific language so setLangBasedOnDomainMiddleware won't override it
      req.userLanguageSet = true
    }
  } catch (error) {
    // Log error but don't fail the request
    logger.error({ error }, 'Error setting user language')
  }
  
  next()
}

export default setUserLanguageMiddleware

