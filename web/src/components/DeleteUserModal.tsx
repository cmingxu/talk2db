import { Button } from "./ui/button";

interface DeleteUserModalProps {
  user: {
    id: number;
    nickname: string;
  };
  onClose: () => void;
  onDelete: (id: number) => Promise<void>;
}

export default function DeleteUserModal({ user, onClose, onDelete }: DeleteUserModalProps) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
        <h2 className="text-xl font-bold mb-4">删除用户</h2>
        <p>确定要删除用户“{user.nickname}”吗？</p>
        <div className="mt-6 flex justify-end space-x-4">
          <Button type="button" variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button type="button" className="bg-red-500 hover:bg-red-600 text-white" onClick={() => onDelete(user.id)}>
            删除
          </Button>
        </div>
      </div>
    </div>
  );
}
