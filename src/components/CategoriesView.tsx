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
  '#14243F',
  '#274467',
  '#C9A14B',
  '#913F3D',
  '#1E5631',
  '#5A6270',
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
  const canManageCategories =
    (currentUser.role === 'admin' || currentUser.role === 'moderator') &&
    currentUser.isActive;
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#14243F');
  const [newOrder, setNewOrder] = useState<number>(categories.length + 1);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('#14243F');
  const [expandedCatId, setExpandedCatId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const sortedCategories = [...categories].sort(
    (a, b) => a.sortOrder - b.sortOrder
  );

  if (!canManageCategories) {
    return (
      <div className="bg-surface-muted border border-nga-xam rounded-xl px-4 py-3 text-xs sm:text-sm text-huyen-lam/85">
        Chỉ tài khoản <strong>Admin</strong> hoặc <strong>Moderator</strong> mới được quản lý hạng mục công việc.
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
      setNewColor('#14243F');
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
          <h2 className="text-base sm:text-lg font-bold text-huyen-lam">
            Quản lý hạng mục công việc
          </h2>
          <p className="text-xs text-ink-muted mt-0.5">
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
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-huyen-lam text-huyen-lam text-xs font-medium hover:bg-nga-thien transition-colors min-h-[40px]"
            >
              <FolderPlus className="w-4 h-4 shrink-0" />
              <span>Khởi tạo 3 hạng mục TBHGN</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setNewOrder(sortedCategories.length + 1);
              setShowAddForm((v) => !v);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-huyen-lam text-white text-xs font-medium hover:bg-lam-tri-tue transition-colors min-h-[40px]"
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span>Thêm hạng mục</span>
          </button>
        </div>
      </div>

      {showAddForm && (
        <form
          onSubmit={handleCreate}
          className="bg-white border border-nga-xam rounded-xl p-4 space-y-3"
        >
          <div className="text-sm font-semibold text-huyen-lam">
            Thêm hạng mục mới
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
            <div className="sm:col-span-5">
              <label className="block text-xs font-medium text-huyen-lam/85 mb-1">
                Tên hạng mục
              </label>
              <input
                type="text"
                required
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="VD: Biên tập & chế bản"
                className="w-full px-3 py-2 text-sm bg-white border border-nga-xam rounded-lg focus:outline-none focus:ring-2 focus:ring-lam-tri-tue min-h-[42px]"
              />
            </div>

            <div className="sm:col-span-5">
              <label className="block text-xs font-medium text-huyen-lam/85 mb-1">
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
                      className={`w-6 h-6 rounded-full border-2 transition-transform ${
                        newColor.toLowerCase() === hex.toLowerCase()
                          ? 'border-huyen-lam scale-110'
                          : 'border-white shadow-sm'
                      }`}
                    />
                  ))}
                </div>
                <input
                  type="color"
                  value={newColor}
                  onChange={(e) => setNewColor(e.target.value)}
                  className="w-8 h-8 rounded border border-nga-xam cursor-pointer"
                />
              </div>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-huyen-lam/85 mb-1">
                Thứ tự
              </label>
              <input
                type="number"
                min={1}
                value={newOrder}
                onChange={(e) => setNewOrder(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm font-mono-tabular bg-white border border-nga-xam rounded-lg focus:outline-none focus:ring-2 focus:ring-lam-tri-tue min-h-[42px]"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="px-3.5 py-2 text-xs font-medium text-ink-muted hover:text-huyen-lam min-h-[40px]"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={busy}
              className="px-4 py-2 text-xs font-medium bg-huyen-lam text-white rounded-lg hover:bg-lam-tri-tue disabled:opacity-50 transition-colors min-h-[40px]"
            >
              {busy ? 'Đang lưu...' : 'Tạo hạng mục'}
            </button>
          </div>
        </form>
      )}

      {sortedCategories.length === 0 ? (
        <div className="bg-white border border-nga-xam rounded-xl px-4 py-8 text-center space-y-3">
          <p className="text-sm text-ink-muted">
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
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium bg-huyen-lam text-white rounded-lg hover:bg-lam-tri-tue transition-colors min-h-[40px]"
          >
            <FolderPlus className="w-4 h-4 shrink-0" />
            <span>Khởi tạo 3 hạng mục mặc định TBHGN</span>
          </button>
        </div>
      ) : (
        <div className="bg-white border border-nga-xam rounded-xl divide-y divide-nga-xam/60 overflow-hidden">
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
                className={`p-4 space-y-2.5 ${!cat.isActive ? 'bg-nga-thien opacity-80' : ''}`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    {isEditing ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="px-2.5 py-1.5 text-sm bg-white border border-nga-xam rounded-lg min-w-[180px] focus:outline-none focus:ring-2 focus:ring-lam-tri-tue"
                        />
                        <input
                          type="color"
                          value={editColor}
                          onChange={(e) => setEditColor(e.target.value)}
                          className="w-8 h-8 rounded border border-nga-xam cursor-pointer"
                        />
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => saveEdit(cat.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-huyen-lam hover:bg-lam-tri-tue text-white rounded-lg"
                        >
                          <Check className="w-3.5 h-3.5 shrink-0" />
                          <span>Lưu</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="p-1.5 text-ink-muted hover:text-huyen-lam"
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
                        <span className="text-sm font-semibold text-huyen-lam">
                          {cat.name}
                        </span>
                        <span className="text-[11px] font-mono-tabular px-1.5 py-0.5 rounded bg-surface-muted text-ink-muted">
                          {cat.id}
                        </span>
                        {!cat.isActive && (
                          <span className="text-[11px] font-medium text-red-700 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded">
                            Ngừng sử dụng
                          </span>
                        )}
                      </div>
                    )}

                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
                      <span>Thứ tự: #{cat.sortOrder}</span>
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedCatId(isExpanded ? null : cat.id)
                        }
                        className="inline-flex items-center gap-1 text-huyen-lam hover:text-lam-tri-tue hover:underline font-medium"
                      >
                        {isExpanded ? (
                          <ChevronDown className="w-3.5 h-3.5 shrink-0" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5 shrink-0" />
                        )}
                        <span>{activeCatTasks.length} công việc đang mở</span>
                      </button>
                      {activeCatTasks.length > 0 && (
                        <button
                          type="button"
                          onClick={() => onFilterTasksByCategory(cat.id)}
                          className="text-xs text-ink-muted hover:text-huyen-lam underline"
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
                      className="p-2 rounded-lg border border-nga-xam text-ink-muted hover:bg-nga-thien hover:text-huyen-lam disabled:opacity-35 transition-colors"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={idx === sortedCategories.length - 1 || busy}
                      onClick={() => onSwapOrder(cat, sortedCategories[idx + 1])}
                      aria-label={`Đưa ${cat.name} xuống`}
                      className="p-2 rounded-lg border border-nga-xam text-ink-muted hover:bg-nga-thien hover:text-huyen-lam disabled:opacity-35 transition-colors"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => startEdit(cat)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-nga-xam text-huyen-lam/85 hover:bg-nga-thien min-h-[36px] transition-colors"
                    >
                      <Edit2 className="w-3.5 h-3.5 shrink-0" />
                      <span>Sửa</span>
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        onUpdateCategory(cat.id, { isActive: !cat.isActive })
                      }
                      className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg border min-h-[36px] transition-colors ${
                        cat.isActive
                          ? 'border-nga-xam text-huyen-lam/85 hover:bg-minh-kim-soft hover:text-minh-kim-ink hover:border-minh-kim-border'
                          : 'border-emerald-200 bg-emerald-50 text-emerald-800'
                      }`}
                    >
                      <Power className="w-3.5 h-3.5 shrink-0" />
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
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-35 min-h-[36px] transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5 shrink-0" />
                      <span>Xóa</span>
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="pt-2 pl-4 border-t border-nga-xam/60 space-y-1.5">
                    {catTasks.length === 0 ? (
                      <p className="text-xs text-ink-muted">
                        Chưa có công việc nào thuộc hạng mục này.
                      </p>
                    ) : (
                      catTasks.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => onSelectTask(t.id)}
                          className="w-full text-left px-3 py-2 rounded-lg bg-nga-thien hover:bg-surface-muted flex items-center justify-between gap-2 text-xs transition-colors"
                        >
                          <div className="min-w-0 truncate">
                            <span className="font-mono-tabular font-semibold text-huyen-lam mr-2">
                              {t.displayCode}
                            </span>
                            <span className="text-huyen-lam/90">{t.title}</span>
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
