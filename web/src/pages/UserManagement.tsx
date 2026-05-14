import { useEffect, useState } from "react";
import { UserCog, UserPlus, Users, Settings2 } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import ChangePasswordModal from "../components/ChangePasswordModal";
import DeleteUserModal from "../components/DeleteUserModal";

interface User {
  id: number;
  nickname: string;
  role: string;
}

interface Datasource {
  id: number;
  name: string;
  engine: string;
}

export default function UserManagement() {
  const [users, setUsers] = useState<User[]>([]);
  const [datasources, setDatasources] = useState<Datasource[]>([]);
  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [role, setRole] = useState("normal");
  const [selectedDsIds, setSelectedDsIds] = useState<number[]>([]);
  const [error, setError] = useState("");
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [editingDsUser, setEditingDsUser] = useState<User | null>(null);
  const [editDsIds, setEditDsIds] = useState<number[]>([]);
  const [savingDs, setSavingDs] = useState(false);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const response = await fetch("/api/users");
        if (response.ok) {
          const data = await response.json();
          setUsers(data);
        } else {
          setError("获取用户列表失败");
        }
      } catch {
        setError("发生错误");
      }
    };

    const fetchDatasources = async () => {
      try {
        const response = await fetch("/api/datasources");
        if (response.ok) {
          setDatasources(await response.json());
        }
      } catch { /* ignore */ }
    };

    fetchUsers();
    fetchDatasources();
  }, []);

  const loadUserDatasources = async (userId: number) => {
    try {
      const response = await fetch(`/api/users/${userId}/datasources`);
      if (response.ok) {
        const data = await response.json();
        return data.datasourceIds as number[];
      }
    } catch { /* ignore */ }
    return [];
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("两次输入的密码不一致");
      return;
    }

    if (!nickname) {
      setError("请输入用户名");
      return;
    }

    try {
      const body: any = { nickname, password, role };
      if (role === "normal") {
        body.datasourceIds = selectedDsIds;
      }
      const response = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        const newUser = await response.json();
        setUsers([...users, newUser]);
        setNickname("");
        setPassword("");
        setConfirmPassword("");
        setRole("normal");
        setSelectedDsIds([]);
      } else {
        const data = await response.json();
        setError(data.error || "发生错误");
      }
    } catch {
      setError("发生错误");
    }
  };

  const handleChangePassword = async (id: number, newPassword: string) => {
    try {
      const response = await fetch(`/api/users/${id}/password`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: newPassword }),
      });
      if (!response.ok) {
        const data = await response.json();
        setError(data.error || "发生错误");
      }
    } catch {
      setError("发生错误");
    }
  };

  const handleDeleteUser = async (id: number) => {
    try {
      const response = await fetch(`/api/users/${id}`, { method: "DELETE" });
      if (response.ok) {
        setUsers(users.filter((user) => user.id !== id));
      } else {
        const data = await response.json();
        setError(data.error || "发生错误");
      }
    } catch {
      setError("发生错误");
    }
  };

  const handleEditDatasources = async (user: User) => {
    const ids = await loadUserDatasources(user.id);
    setEditDsIds(ids);
    setEditingDsUser(user);
  };

  const handleSaveDatasources = async () => {
    if (!editingDsUser) return;
    setSavingDs(true);
    try {
      const response = await fetch(`/api/users/${editingDsUser.id}/datasources`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ datasourceIds: editDsIds }),
      });
      if (response.ok) {
        setEditingDsUser(null);
      } else {
        const data = await response.json();
        setError(data.error || "发生错误");
      }
    } catch {
      setError("发生错误");
    } finally {
      setSavingDs(false);
    }
  };

  const toggleDs = (id: number, isEdit: boolean) => {
    if (isEdit) {
      setEditDsIds(prev =>
        prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
      );
    } else {
      setSelectedDsIds(prev =>
        prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
      );
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-xl font-medium text-muted-foreground bg-white p-4 rounded-lg border shadow-sm">
        <UserCog className="h-5 w-5" />
        用户管理
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}
      <div className="flex space-x-8">
        <div className="w-1/3 bg-white p-6 rounded-lg border shadow-sm h-fit">
          <h2 className="flex items-center gap-2 text-xl font-bold">
            <UserPlus className="h-5 w-5 text-primary" />
            添加用户
          </h2>
          <form className="mt-2 space-y-4" onSubmit={handleAddUser}>
            <div>
              <label className="block text-sm font-medium text-gray-700">用户名</label>
              <Input
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">密码</label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">确认密码</label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">角色</label>
              <select
                className="w-full border rounded-md p-2 text-sm bg-background"
                value={role}
                onChange={(e) => setRole(e.target.value)}
              >
                <option value="normal">普通用户</option>
                <option value="admin">管理员</option>
              </select>
            </div>
            {role === "normal" && datasources.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">可访问的数据源</label>
                <div className="max-h-40 overflow-y-auto space-y-1 border rounded-md p-2">
                  {datasources.map(ds => (
                    <label key={ds.id} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedDsIds.includes(ds.id)}
                        onChange={() => toggleDs(ds.id, false)}
                      />
                      {ds.name} ({ds.engine})
                    </label>
                  ))}
                </div>
              </div>
            )}
            <Button>添加用户</Button>
          </form>
        </div>
        <div className="w-2/3 bg-white p-6 rounded-lg border shadow-sm">
          <h2 className="flex items-center gap-2 text-xl font-bold mb-4">
            <Users className="h-5 w-5 text-primary" />
            用户列表
          </h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>用户名</TableHead>
                <TableHead>角色</TableHead>
                <TableHead>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>{user.id}</TableCell>
                  <TableCell>{user.nickname}</TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      user.role === "admin"
                        ? "bg-purple-100 text-purple-700"
                        : "bg-slate-100 text-slate-600"
                    }`}>
                      {user.role === "admin" ? "管理员" : "普通用户"}
                    </span>
                  </TableCell>
                  <TableCell className="space-x-2">
                    <Button variant="outline" onClick={() => setSelectedUser(user)}>
                      修改密码
                    </Button>
                    {user.role === "normal" && (
                      <Button variant="outline" onClick={() => handleEditDatasources(user)}>
                        <Settings2 className="h-3 w-3 mr-1" />
                        数据源
                      </Button>
                    )}
                    <Button variant="outline" onClick={() => setUserToDelete(user)}>
                      删除
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {selectedUser && (
        <ChangePasswordModal
          user={selectedUser}
          onClose={() => setSelectedUser(null)}
          onChangePassword={handleChangePassword}
        />
      )}
      {userToDelete && (
        <DeleteUserModal
          user={userToDelete}
          onClose={() => setUserToDelete(null)}
          onDelete={handleDeleteUser}
        />
      )}
      {editingDsUser && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center">
          <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md space-y-4">
            <h3 className="text-lg font-semibold">编辑数据源权限 - {editingDsUser.nickname}</h3>
            <div className="max-h-60 overflow-y-auto space-y-1 border rounded-md p-2">
              {datasources.map(ds => (
                <label key={ds.id} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editDsIds.includes(ds.id)}
                    onChange={() => toggleDs(ds.id, true)}
                  />
                  {ds.name} ({ds.engine})
                </label>
              ))}
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setEditingDsUser(null)}>取消</Button>
              <Button onClick={handleSaveDatasources} disabled={savingDs}>保存</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
