import React, { useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronRight,
  Edit2,
  FolderPlus,
  Plus,
  Power,
  Trash2,
  X,
} from 'lucide-react';
import { CategoryItem, ProjectMember, TaskItem } from '../types/project';
import { isB1TestTask } from '../utils/taskHelpers';
import { StatusBadge } from './StatusBadge';

interface CategoriesViewProps {
  categories: CategoryItem[];
  tasks: TaskItem[];
  currentUser: ProjectMember;
  onSeedDefaults: () => Promise<void>;
  onCreateCategory: (input: {
    name: string;
    color: string;
    sortOrder: number;
  }) => Promise<void>;
  onUpdateCategory: (
    categoryId: string,
    patch: Partial<Pick<CategoryItem, 'name' | 'color' | 'sortOrder' | 'isActive'>>
  ) => Promise<void>;
  onSwapOrder: (catA: CategoryItem, catB: CategoryItem) => Promise<void>;
  onDeleteUnusedCategory: (categoryId: string) => Promise<void>;
  onSelectTask: (taskId: string) => void;
  onFilterTasksByCategory: (categoryId: string) => void;
}

const COLOR_SWATCHES = [
  '#13294B',
  '#1E5631',
  '#8A5A00',
  '#103A5C',
  '#6B111C',
  '#475569',
];

export const CategoriesView: React.FC<CategoriesViewProps> = ({
  categories,
  tasks,
  currentUser,
  onSeedDefaults,
  onCreateCategory,
  onUpdateCategory,
  onSwapOrder,
  onDeleteUnusedCategory,
  onSelectTask,
  onFilterTasksByCategory,
}) => {
  const isAdmin = currentUser.role === 'admin' && currentUser.isActive;
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#13294B');
  const [newOrder, setNewOrder] = useState<number>(categories.length + 1);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('#13294B');
  const [expandedCatId, setExpandedCatId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const sortedCategories = [...categories].sort(
    (a, b) => a.sortOrder - b.sortOrder
  );

  if (!isAdmin) {
    return (
      <div className="bg-slate-100 border border-slate-200 rounded-xl px-4 py-3 text-xs sm:text-sm text-slate-700">
        Chỉ tài khoản có vai trò <strong>Admin</strong> mới được quản lý hạng mục công việc.
      </div>
    );
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || busy) return;
    setBusy(true);
    try {
      await onCreateCategory({
        name: newName.trim(),
        color: newColor,
        sortOrder: Number.isFinite(newOrder)
          ? newOrder
          : sortedCategories.length + 1,
      });
      setNewName('');
      setNewColor('#13294B');
      setNewOrder(sortedCategories.length + 2);
      setShowAddForm(false);
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (cat: CategoryItem) => {
    setEditingId(cat.id);
    setEditName(cat.name);
    setEditColor(cat.color);
  };

  const saveEdit = async (categoryId: string) => {
    if (!editName.trim() || busy) return;
    setBusy(true);
    try {
      await onUpdateCategory(categoryId, {
        name: editName.trim(),
        color: editColor,
      });
      setEditingId(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-[#13294B]">
            Quản lý hạng mục công việc
          </h2>
          <p className="text-xs text-slate-600 mt-0.5">
            Công việc tham chiếu bằng ID ổn định (<code className="font-mono-tabular">categoryId</code>). Không xóa vĩnh viễn hạng mục đã được sử dụng.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {sortedCategories.length === 0 && (
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await onSeedDefaults();
                } finally {
                  setBusy(false);
                }
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[#13294B] text-[#13294B] text-xs font-medium hover:bg-slate-50 min-h-[40px]"
            >
              <FolderPlus className="w-4 h-4" />
              <span>Khởi tạo 3 hạng mục TBHGN</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setNewOrder(sortedCategories.length + 1);
              setShowAddForm((v) => !v);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#13294B] text-white text-xs font-medium hover:bg-[#1E3A66] min-h-[40px]"
          >
            <Plus className="w-4 h-4" />
            <span>Thêm hạng mục</span>
          </button>
        </div>
      </div>

      {showAddForm && (
        <form
          onSubmit={handleCreate}
          className="bg-white border border-slate-200 rounded-xl p-4 space-y-3"
        >
          <div className="text-sm font-semibold text-[#13294B]">
            Thêm hạng mục mới
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
            <div className="sm:col-span-5">
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Tên hạng mục
              </label>
              <input
                type="text"
                required
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="VD: Biên tập & chế bản"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#13294B]"
              />
            </div>

            <div className="sm:col-span-5">
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Màu nhận diện
              </label>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5">
                  {COLOR_SWATCHES.map((hex) => (
                    <button
                      key={hex}
                      type="button"
                      onClick={() => setNewColor(hex)}
                      aria-label={`Chọn màu ${hex}`}
                      style={{ backgroundColor: hex }}
                      className={`w-6 h-6 rounded-full border-2 ${
                        newColor.toLowerCase() === hex.toLowerCase()
                          ? 'border-slate-900 scale-110'
                          : 'border-white shadow-sm'
                      }`}
                    />
                  ))}
                </div>
                <input
                  type="color"
                  value={newColor}
                  onChange={(e) => setNewColor(e.target.value)}
                  className="w-8 h-8 rounded border border-slate-200 cursor-pointer"
                />
              </div>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Thứ tự
              </label>
              <input
                type="number"
                min={1}
                value={newOrder}
                onChange={(e) => setNewOrder(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm font-mono-tabular border border-slate-200 rounded-lg"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="px-3.5 py-2 text-xs font-medium text-slate-600 hover:text-slate-900"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={busy}
              className="px-4 py-2 text-xs font-medium bg-[#13294B] text-white rounded-lg hover:bg-[#1E3A66] disabled:opacity-50"
            >
              {busy ? 'Đang lưu...' : 'Tạo hạng mục'}
            </button>
          </div>
        </form>
      )}

      {sortedCategories.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl px-4 py-8 text-center space-y-3">
          <p className="text-sm text-slate-600">
            Chưa có hạng mục nào trong collection <code className="font-mono-tabular">categories</code> trên Firestore.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onSeedDefaults();
              } finally {
                setBusy(false);
              }
            }}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium bg-[#13294B] text-white rounded-lg hover:bg-[#1E3A66]"
          >
            <FolderPlus className="w-4 h-4" />
            <span>Khởi tạo 3 hạng mục mặc định TBHGN</span>
          </button>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden">
          {sortedCategories.map((cat, idx) => {
            const catTasks = tasks.filter(
              (t) => t.categoryId === cat.id && !isB1TestTask(t)
            );
            const activeCatTasks = catTasks.filter((t) => !t.archivedAt);
            const isEditing = editingId === cat.id;
            const isExpanded = expandedCatId === cat.id;

            return (
              <div
                key={cat.id}
                className={`p-4 space-y-2.5 ${!cat.isActive ? 'bg-slate-50 opacity-80' : ''}`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    {isEditing ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="px-2.5 py-1.5 text-sm border border-slate-300 rounded-lg min-w-[180px]"
                        />
                        <input
                          type="color"
                          value={editColor}
                          onChange={(e) => setEditColor(e.target.value)}
                          className="w-8 h-8 rounded border border-slate-200 cursor-pointer"
                        />
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => saveEdit(cat.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-[#13294B] text-white rounded-lg"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Lưu</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="p-1.5 text-slate-500 hover:text-slate-900"
                          aria-label="Hủy sửa"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{ backgroundColor: cat.color }}
                        />
                        <span className="text-sm font-semibold text-slate-900">
                          {cat.name}
                        </span>
                        <span className="text-[11px] font-mono-tabular px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                          {cat.id}
                        </span>
                        {!cat.isActive && (
                          <span className="text-[11px] font-medium text-red-700 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded">
                            Ngừng sử dụng
                          </span>
                        )}
                      </div>
                    )}

                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                      <span>Thứ tự: #{cat.sortOrder}</span>
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedCatId(isExpanded ? null : cat.id)
                        }
                        className="inline-flex items-center gap-1 text-[#13294B] hover:underline font-medium"
                      >
                        {isExpanded ? (
                          <ChevronDown className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5" />
                        )}
                        <span>{activeCatTasks.length} công việc đang mở</span>
                      </button>
                      {activeCatTasks.length > 0 && (
                        <button
                          type="button"
                          onClick={() => onFilterTasksByCategory(cat.id)}
                          className="text-xs text-slate-600 hover:text-[#13294B] underline"
                        >
                          Mở trong Công việc
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      disabled={idx === 0 || busy}
                      onClick={() => onSwapOrder(cat, sortedCategories[idx - 1])}
                      aria-label={`Đưa ${cat.name} lên`}
                      className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-35"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={idx === sortedCategories.length - 1 || busy}
                      onClick={() => onSwapOrder(cat, sortedCategories[idx + 1])}
                      aria-label={`Đưa ${cat.name} xuống`}
                      className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-35"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => startEdit(cat)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 min-h-[36px]"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                      <span>Sửa</span>
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        onUpdateCategory(cat.id, { isActive: !cat.isActive })
                      }
                      className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg border min-h-[36px] ${
                        cat.isActive
                          ? 'border-slate-200 text-slate-700 hover:bg-amber-50 hover:text-amber-800'
                          : 'border-emerald-200 bg-emerald-50 text-emerald-800'
                      }`}
                    >
                      <Power className="w-3.5 h-3.5" />
                      <span>{cat.isActive ? 'Ngừng dùng' : 'Kích hoạt'}</span>
                    </button>
                    <button
                      type="button"
                      disabled={catTasks.length > 0 || busy}
                      onClick={() => onDeleteUnusedCategory(cat.id)}
                      title={
                        catTasks.length > 0
                          ? `Không thể xóa vì có ${catTasks.length} công việc tham chiếu`
                          : 'Xóa hạng mục chưa từng sử dụng'
                      }
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-35 min-h-[36px]"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Xóa</span>
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="pt-2 pl-4 border-t border-slate-100 space-y-1.5">
                    {catTasks.length === 0 ? (
                      <p className="text-xs text-slate-500">
                        Chưa có công việc nào thuộc hạng mục này.
                      </p>
                    ) : (
                      catTasks.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => onSelectTask(t.id)}
                          className="w-full text-left px-3 py-2 rounded-lg bg-slate-50 hover:bg-slate-100 flex items-center justify-between gap-2 text-xs"
                        >
                          <div className="min-w-0 truncate">
                            <span className="font-mono-tabular font-semibold text-[#13294B] mr-2">
                              {t.displayCode}
                            </span>
                            <span className="text-slate-800">{t.title}</span>
                          </div>
                          <StatusBadge status={t.status} compact />
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
