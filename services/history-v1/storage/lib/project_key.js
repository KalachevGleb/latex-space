// Keep in sync with services/filestore/app/js/project_key.js
const path = require('node:path')

//
// The advice in http://docs.aws.amazon.com/AmazonS3/latest/dev/
// request-rate-perf-considerations.html is to avoid sequential key prefixes,
// so we reverse the project ID part of the key as they suggest.
//
function format(projectId) {
  // Handle both numeric IDs (legacy) and ObjectId strings (new history system)
  const idString = String(projectId)
  
  // Check if it's a MongoDB ObjectId (24 hex characters)
  if (/^[0-9a-f]{24}$/i.test(idString)) {
    // For ObjectIds, create a path structure similar to numeric IDs
    // but using segments of the hex string
    return path.join(
      idString.slice(0, 3),
      idString.slice(3, 6),
      idString.slice(6)
    )
  }
  
  // Legacy path for numeric project IDs
  const prefix = naiveReverse(pad(projectId))
  return path.join(prefix.slice(0, 3), prefix.slice(3, 6), prefix.slice(6))
}

function pad(number) {
  return (number || 0).toString().padStart(9, '0')
}

function naiveReverse(string) {
  return string.split('').reverse().join('')
}

exports.format = format
exports.pad = pad
