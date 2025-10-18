import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { getJSON } from '@/infrastructure/fetch-json'
import OLCard from '@/shared/components/ol/ol-card'
import OLFormControl from '@/shared/components/ol/ol-form-control'
import OLFormLabel from '@/shared/components/ol/ol-form-label'
import OLButton from '@/shared/components/ol/ol-button'
import MaterialIcon from '@/shared/components/material-icon'

type User = {
  _id: string
  email: string
  name: string
  isAdmin: boolean
  loginCount: number
  lastLoggedIn: Date | null
  createdAt: Date | null
  projectCount: number
}

type UsersResponse = {
  users: User[]
  total: number
  page: number
  limit: number
  totalPages: number
}

export default function UsersList() {
  const { t } = useTranslation()
  const [users, setUsers] = useState<User[]>([])
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const limit = 20

  useEffect(() => {
    loadUsers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search])

  async function loadUsers() {
    setIsLoading(true)
    try {
      const data = await getJSON<UsersResponse>(
        `/admin/users/list?search=${encodeURIComponent(search)}&page=${page}&limit=${limit}`
      )
      setUsers(data.users)
      setTotal(data.total)
      setTotalPages(data.totalPages)
    } catch (error) {
      console.error('Failed to load users:', error)
    } finally {
      setIsLoading(false)
    }
  }

  function handleSearchChange(e: React.ChangeEvent<HTMLInputElement>) {
    setSearch(e.target.value)
    setPage(1)
  }

  function formatDate(date: Date | null) {
    if (!date) return '-'
    return new Date(date).toLocaleDateString('ru-RU', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  return (
    <OLCard>
      <div className="mb-3">
        <h2 className="h4 mb-3">{t('users_list')}</h2>
        <div className="d-flex align-items-center gap-2 mb-3">
          <div className="flex-grow-1">
            <OLFormLabel htmlFor="user-search" visuallyHidden>
              {t('search')}
            </OLFormLabel>
            <OLFormControl
              id="user-search"
              type="text"
              placeholder={t('search_users')}
              value={search}
              onChange={handleSearchChange}
            />
          </div>
          <div className="text-muted">
            {t('total')}: {total}
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-4">
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
        </div>
      ) : (
        <>
          <div className="table-responsive">
            <table className="table table-hover table-sm mb-0">
              <thead className="table-light">
                <tr>
                  <th style={{ width: '30%' }}>{t('email')}</th>
                  <th style={{ width: '15%' }}>{t('name')}</th>
                  <th style={{ width: '10%' }} className="text-center">
                    {t('projects')}
                  </th>
                  <th style={{ width: '10%' }} className="text-center">
                    {t('logins')}
                  </th>
                  <th style={{ width: '15%' }}>{t('last_login')}</th>
                  <th style={{ width: '15%' }}>{t('created')}</th>
                  <th style={{ width: '5%' }} className="text-center">
                    {t('admin')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center text-muted py-4">
                      {search ? t('no_users_found') : t('no_users_yet')}
                    </td>
                  </tr>
                ) : (
                  users.map(user => (
                    <tr key={user._id}>
                      <td className="text-break">{user.email}</td>
                      <td>{user.name}</td>
                      <td className="text-center">
                        {user.projectCount}
                      </td>
                      <td className="text-center">{user.loginCount}</td>
                      <td className="small text-muted">
                        {formatDate(user.lastLoggedIn)}
                      </td>
                      <td className="small text-muted">
                        {formatDate(user.createdAt)}
                      </td>
                      <td className="text-center">
                        {user.isAdmin && (
                          <MaterialIcon type="check" className="text-success" />
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="d-flex justify-content-center gap-2 mt-3">
              <OLButton
                variant="secondary"
                size="sm"
                disabled={page === 1}
                onClick={() => setPage(p => p - 1)}
              >
                <MaterialIcon type="chevron_left" />
              </OLButton>
              <span className="d-flex align-items-center px-2">
                {t('page')} {page} {t('of')} {totalPages}
              </span>
              <OLButton
                variant="secondary"
                size="sm"
                disabled={page === totalPages}
                onClick={() => setPage(p => p + 1)}
              >
                <MaterialIcon type="chevron_right" />
              </OLButton>
            </div>
          )}
        </>
      )}
    </OLCard>
  )
}

