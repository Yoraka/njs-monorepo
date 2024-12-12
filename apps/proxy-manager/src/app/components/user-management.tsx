"use client"

import { useState, useEffect } from "react"
import { useSession } from "next-auth/react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "@/hooks/use-toast"
import { Pencil, Trash2, UserPlus } from "lucide-react"
import { useTranslation } from "react-i18next"

type User = {
  id: string
  userName: string
  email: string
  role: "admin" | "user"
}

export default function UserManagement() {
  const { t } = useTranslation()
  const { data: session } = useSession()
  const [users, setUsers] = useState<User[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [totalUsers, setTotalUsers] = useState(0)
  const pageSize = 10
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [newUser, setNewUser] = useState<Partial<User>>({})
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [passwordChangeUserId, setPasswordChangeUserId] = useState<string | null>(null)

  const isAdmin = session?.user?.role === "admin"
  const currentUserId = session?.user?.id

  const canEditUser = (userId: string) => {
    return isAdmin || userId === currentUserId
  }

  const handleEditUser = (user: User) => {
    setEditingUser(user)
  }

  const handleUpdateUser = async () => {
    if (editingUser) {
      try {
        const response = await fetch(`/api/users/${editingUser.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userName: editingUser.userName,
            email: editingUser.email,
            role: editingUser.role,
          }),
        })

        if (!response.ok) throw new Error('Failed to update user')

        const updatedUser = await response.json()
        setUsers(users.map(u => u.id === updatedUser.id ? updatedUser : u))
        setEditingUser(null)
        toast({
          title: "Success",
          description: `User ${updatedUser.userName} has been updated.`,
          variant: "default",
        })
      } catch (error) {
        console.error('Error updating user:', error)
        toast({
          title: "Error",
          description: "Failed to update user",
          variant: "destructive",
        })
      }
    }
  }

  const handleDeleteUser = async (userId: string) => {
    try {
      const response = await fetch(`/api/users/${userId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error('Failed to delete user')
      }

      setUsers(users.filter(u => u.id !== userId))
      
      toast({
        title: "Success",
        description: "The user has been deleted successfully.",
        variant: "default",
      })
    } catch (error) {
      console.error('Error deleting user:', error)
      toast({
        title: "Error",
        description: "Failed to delete user",
        variant: "destructive",
      })
    }
  }

  const handleAddUser = async () => {
    if (newUser.userName && newUser.email && newUser.role) {
      try {
        const response = await fetch('/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...newUser,
            password: "123"  // 设置默认密码
          }),
        })
        
        if (!response.ok) throw new Error('Failed to add user')
        
        const addedUser = await response.json()
        setUsers(prevUsers => [addedUser, ...prevUsers])
        setTotalUsers(prev => prev + 1)
        setNewUser({})
        toast({
          title: "User Added",
          description: `New user ${addedUser.username} has been added successfully. Default password is "123"`,
          variant: "default",
        })
      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to add user",
          variant: "destructive",
        })
      }
    }
  }

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) {
      toast({
        title: "Error",
        description: "New passwords do not match.",
        variant: "destructive",
      })
      return
    }

    try {
      const userId = passwordChangeUserId || currentUserId
      if (!userId) return

      const response = await fetch(`/api/users/${userId}/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(userId === currentUserId ? { currentPassword } : {}),
          newPassword: newPassword,
        }),
      })

      if (!response.ok) throw new Error('Failed to change password')

      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")
      setPasswordChangeUserId(null)

      toast({
        title: "Success",
        description: "Password has been changed successfully.",
        variant: "default",
      })
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to change password",
        variant: "destructive",
      })
    }
  }

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const [usersResponse, countResponse] = await Promise.all([
          fetch(`/api/users?skip=${page * pageSize}&take=${pageSize}`),
          fetch('/api/users/count')
        ])
        
        if (!usersResponse.ok || !countResponse.ok) {
          throw new Error('Failed to fetch users')
        }
        
        const [usersData, { count }] = await Promise.all([
          usersResponse.json(),
          countResponse.json()
        ])
        
        setUsers(usersData)
        setTotalUsers(count)
      } catch (error) {
        console.error('Error:', error)
        toast({
          title: "Error",
          description: "Failed to load users",
          variant: "destructive",
        })
      } finally {
        setIsLoading(false)
      }
    }

    fetchUsers()
  }, [page])

  const totalPages = Math.ceil(totalUsers / pageSize)
  const handlePreviousPage = () => setPage(p => Math.max(0, p - 1))
  const handleNextPage = () => setPage(p => Math.min(totalPages - 1, p + 1))

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>{t('userManagement.title')}</CardTitle>
        <CardDescription>
          {isAdmin 
            ? t('userManagement.manageAllUsersAndPermissions') 
            : t('userManagement.viewUsersAndManageYourPassword')
          }
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="users">
          <TabsList>
            <TabsTrigger value="users">{t('userManagement.users')}</TabsTrigger>
            <TabsTrigger value="password">{t('userManagement.changePassword')}</TabsTrigger>
          </TabsList>
          <TabsContent value="users">
            <div className="space-y-4">
              {isAdmin && (
                <Dialog>
                  <DialogTrigger asChild>
                    <Button>
                      <UserPlus className="mr-2 h-4 w-4" />
                      {t('userManagement.addNewUser')}
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>{t('userManagement.addNewUser')}</DialogTitle>
                      <DialogDescription>
                        {t('userManagement.enterNewUserDetails')}
                      </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                      <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="new-username" className="text-right">
                          {t('userManagement.username')}
                        </Label>
                        <Input
                          id="new-username"
                          value={newUser.userName || ""}
                          onChange={(e) => setNewUser({ ...newUser, userName: e.target.value })}
                          className="col-span-3"
                        />
                      </div>
                      <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="new-email" className="text-right">
                          {t('userManagement.email')}
                        </Label>
                        <Input
                          id="new-email"
                          type="email"
                          value={newUser.email || ""}
                          onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                          className="col-span-3"
                        />
                      </div>
                      <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="new-role" className="text-right">
                          {t('userManagement.role')}
                        </Label>
                        <Select onValueChange={(value) => setNewUser({ ...newUser, role: value as "admin" | "user" })}>
                          <SelectTrigger className="col-span-3">
                            <SelectValue placeholder={t('userManagement.selectARole')} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">{t('userManagement.admin')}</SelectItem>
                            <SelectItem value="user">{t('userManagement.user')}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button onClick={handleAddUser}>{t('userManagement.addUser')}</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('userManagement.username')}</TableHead>
                    <TableHead>{t('userManagement.email')}</TableHead>
                    <TableHead>{t('userManagement.role')}</TableHead>
                    {isAdmin && <TableHead>{t('userManagement.actions')}</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell>{user.userName}</TableCell>
                      <TableCell>{user.email}</TableCell>
                      <TableCell>{user.role}</TableCell>
                      {isAdmin && (
                        <TableCell>
                          <div className="flex space-x-2">
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              onClick={() => handleEditUser(user)}
                            >
                              <Pencil className="h-4 w-4" />
                              <span className="sr-only">{t('userManagement.edit')}</span>
                            </Button>
                            {user.id !== currentUserId && (
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                onClick={() => handleDeleteUser(user.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                                <span className="sr-only">{t('userManagement.delete')}</span>
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">
                  {t('userManagement.display')} {page * pageSize + 1} {t('userManagement.to')} {Math.min((page + 1) * pageSize, totalUsers)} {t('userManagement.of')} {totalUsers} {t('userManagement.users')}
                </div>
                <div className="flex space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handlePreviousPage}
                    disabled={page === 0}
                  >
                    {t('userManagement.previousPage')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleNextPage}
                    disabled={page >= totalPages - 1}
                  >
                    {t('userManagement.nextPage')}
                  </Button>
                </div>
              </div>
            </div>
          </TabsContent>
          <TabsContent value="password">
            <Card>
              <CardHeader>
                <CardTitle>{t('userManagement.changePassword')}</CardTitle>
                <CardDescription>
                  {isAdmin ? t('userManagement.changeAnyUserPassword') : t('userManagement.updateYourAccountPassword')}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {isAdmin && (
                  <div className="space-y-2">
                    <Label>{t('userManagement.selectAUser')}</Label>
                    <Select 
                      value={passwordChangeUserId || currentUserId || ''} 
                      onValueChange={(value) => setPasswordChangeUserId(value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={t('userManagement.selectAUser')} />
                      </SelectTrigger>
                      <SelectContent>
                        {users.map(user => (
                          <SelectItem key={user.id} value={user.id}>
                            {user.userName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {(!isAdmin || passwordChangeUserId === currentUserId) && (
                  <div className="space-y-2">
                    <Label htmlFor="current-password">{t('userManagement.currentPassword')}</Label>
                    <Input
                      id="current-password"
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                    />
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="new-password">{t('userManagement.newPassword')}</Label>
                  <Input
                    id="new-password"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">{t('userManagement.confirmNewPassword')}</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                </div>
                <Button onClick={handleChangePassword}>
                  {t('userManagement.changePassword')}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </CardContent>
      {isAdmin && (
        <Dialog open={!!editingUser} onOpenChange={() => setEditingUser(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('userManagement.editUser')}</DialogTitle>
              <DialogDescription>
                {t('userManagement.updateUserDetails')}
              </DialogDescription>
            </DialogHeader>
            {editingUser && (
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="edit-username" className="text-right">
                    {t('userManagement.username')}
                  </Label>
                  <Input
                    id="edit-username"
                    value={editingUser.userName}
                    onChange={(e) => setEditingUser({ ...editingUser, userName: e.target.value })}
                    className="col-span-3"
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="edit-email" className="text-right">
                    {t('userManagement.email')}
                  </Label>
                  <Input
                    id="edit-email"
                    type="email"
                    value={editingUser.email}
                    onChange={(e) => setEditingUser({ ...editingUser, email: e.target.value })}
                    className="col-span-3"
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="edit-role" className="text-right">
                    {t('userManagement.role')}
                  </Label>
                  <Select
                    value={editingUser.role}
                    onValueChange={(value) => setEditingUser({ ...editingUser, role: value as "admin" | "user" })}
                  >
                    <SelectTrigger className="col-span-3">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">{t('userManagement.admin')}</SelectItem>
                      <SelectItem value="user">{t('userManagement.user')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button onClick={handleUpdateUser}>{t('userManagement.updateUser')}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </Card>
  )
}