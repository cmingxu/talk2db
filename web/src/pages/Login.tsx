import { useState } from "react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Brain } from "lucide-react";

export default function Login() {
  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname, password }),
      });

      if (response.ok) {
        const meResp = await fetch("/api/me");
        const meData = await meResp.json();
        if (meData.role === "admin") {
          window.location.href = "/dashboard";
        } else {
          window.location.href = "/chat";
        }
      } else {
        const data = await response.json();
        setError(data.error || "登录失败");
      }
    } catch {
      setError("网络错误");
    }
  };

  return (
    <div className="flex items-center justify-center h-screen bg-slate-50">
      <div className="w-full max-w-md p-8 space-y-8 bg-white rounded-lg shadow-md">
        <div className="text-center">
          <div className="flex justify-center mb-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
              <Brain className="h-6 w-6 text-primary" />
            </div>
          </div>
          <h1 className="text-3xl font-bold">Talk2DB</h1>
          <p className="text-sm text-muted-foreground mt-2">AI 驱动的 SQL 助手</p>
        </div>
        <form className="space-y-6" onSubmit={handleSubmit}>
          <div>
            <label className="block text-sm font-medium text-gray-700">用户名</label>
            <Input
              type="text"
              placeholder="admin"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">密码</label>
            <Input
              type="password"
              placeholder="默认: admin"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <Button className="w-full">登录</Button>
        </form>
      </div>
    </div>
  );
}
