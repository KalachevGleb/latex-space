const NotificationsHandler = require('./NotificationsHandler')
const { promisifyAll } = require('@overleaf/promise-utils')

function dropboxDuplicateProjectNames(userId) {
  return {
    key: `dropboxDuplicateProjectNames-${userId}`,
    create(projectName, callback) {
      if (callback == null) {
        callback = function () {}
      }
      NotificationsHandler.createNotification(
        userId,
        this.key,
        'notification_dropbox_duplicate_project_names',
        { projectName },
        null,
        true,
        callback
      )
    },
    read(callback) {
      if (callback == null) {
        callback = function () {}
      }
      NotificationsHandler.markAsReadWithKey(userId, this.key, callback)
    },
  }
}

function dropboxUnlinkedDueToLapsedReconfirmation(userId) {
  return {
    key: 'drobox-unlinked-due-to-lapsed-reconfirmation',
    create(callback) {
      NotificationsHandler.createNotification(
        userId,
        this.key,
        'notification_dropbox_unlinked_due_to_lapsed_reconfirmation',
        {},
        null,
        true,
        callback
      )
    },
    read(callback) {
      NotificationsHandler.markAsReadWithKey(userId, this.key, callback)
    },
  }
}

function projectInvite(invite, project, sendingUser, user) {
  return {
    key: `project-invite-${invite._id}`,
    create(callback) {
      if (callback == null) {
        callback = function () {}
      }
      const messageOpts = {
        userName: sendingUser.first_name,
        projectName: project.name,
        projectId: project._id.toString(),
        token: invite.token,
      }
      NotificationsHandler.createNotification(
        user._id,
        this.key,
        'notification_project_invite',
        messageOpts,
        invite.expires,
        callback
      )
    },
    read(callback) {
      if (callback == null) {
        callback = function () {}
      }
      NotificationsHandler.markAsReadByKeyOnly(this.key, callback)
    },
  }
}

function tpdsFileLimit(userId) {
  return {
    key: `tpdsFileLimit-${userId}`,
    create(projectName, projectId, callback) {
      if (callback == null) {
        callback = function () {}
      }
      const messageOpts = {
        projectName,
        projectId,
      }
      NotificationsHandler.createNotification(
        userId,
        this.key,
        'notification_tpds_file_limit',
        messageOpts,
        null,
        true,
        callback
      )
    },
    read(callback) {
      if (callback == null) {
        callback = function () {}
      }
      NotificationsHandler.markAsReadByKeyOnly(this.key, callback)
    },
  }
}

const NotificationsBuilder = {
  // Note: notification keys should be url-safe
  dropboxUnlinkedDueToLapsedReconfirmation,
  dropboxDuplicateProjectNames,
  projectInvite,
  tpdsFileLimit,
}

NotificationsBuilder.promises = {
  dropboxUnlinkedDueToLapsedReconfirmation: function (userId) {
    return promisifyAll(dropboxUnlinkedDueToLapsedReconfirmation(userId))
  },
  dropboxDuplicateProjectNames(userId) {
    return promisifyAll(dropboxDuplicateProjectNames(userId))
  },
  projectInvite(invite, project, sendingUser, user) {
    return promisifyAll(projectInvite(invite, project, sendingUser, user))
  },
}

module.exports = NotificationsBuilder
