// @ts-check

/** @type {import('./types').PrivilegeLevelsType} */
const PrivilegeLevels = {
  NONE: false,
  READ_ONLY: 'readOnly',
  READ_AND_WRITE: 'readAndWrite',
  REVIEW: 'review',
  ANONYMOUS_REVIEW: 'anonymousReview',
  OWNER: 'owner',
}

module.exports = PrivilegeLevels
