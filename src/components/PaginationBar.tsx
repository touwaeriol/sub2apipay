interface PaginationBarProps {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  pageSizeOptions?: number[];
  isDark?: boolean;
  loading?: boolean;
  onPageChange: (newPage: number) => void;
  onPageSizeChange?: (newSize: number) => void;
}

export default function PaginationBar({
  page,
  totalPages,
  total,
  pageSize,
  pageSizeOptions = [20, 50, 100],
  isDark = false,
  loading = false,
  onPageChange,
  onPageSizeChange,
}: PaginationBarProps) {
  const navBtnClass = (disabled: boolean) =>
    [
      'rounded border px-2.5 py-1 text-xs transition-colors',
      disabled || loading ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer',
      isDark
        ? 'border-slate-600 text-slate-300 hover:bg-slate-800'
        : 'border-slate-300 text-slate-600 hover:bg-slate-100',
    ].join(' ');

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs">
      {/* 左侧：统计 + 每页大小 */}
      <div className="flex items-center gap-2">
        <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>
          共 {total} 条{totalPages > 1 && `，第 ${page} / ${totalPages} 页`}
        </span>

        {onPageSizeChange && (
          <>
            <span className={isDark ? 'text-slate-500' : 'text-slate-400'}>每页</span>
            {pageSizeOptions.map((s) => (
              <button
                key={s}
                type="button"
                disabled={loading}
                onClick={() => {
                  onPageSizeChange(s);
                }}
                className={[
                  'rounded border px-2 py-1 font-medium transition-colors',
                  pageSize === s
                    ? isDark
                      ? 'border-indigo-400 bg-indigo-500/20 text-indigo-200'
                      : 'border-indigo-400 bg-indigo-50 text-indigo-700'
                    : isDark
                      ? 'border-slate-600 text-slate-300 hover:bg-slate-800'
                      : 'border-slate-300 text-slate-600 hover:bg-slate-100',
                  loading ? 'opacity-40 cursor-not-allowed' : '',
                ].join(' ')}
              >
                {s}
              </button>
            ))}
          </>
        )}
      </div>

      {/* 右侧：分页导航 */}
      {totalPages > 1 && (
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={page <= 1 || loading}
            onClick={() => onPageChange(1)}
            className={navBtnClass(page <= 1)}
          >
            ««
          </button>
          <button
            type="button"
            disabled={page <= 1 || loading}
            onClick={() => onPageChange(page - 1)}
            className={navBtnClass(page <= 1)}
          >
            上一页
          </button>
          <button
            type="button"
            disabled={page >= totalPages || loading}
            onClick={() => onPageChange(page + 1)}
            className={navBtnClass(page >= totalPages)}
          >
            下一页
          </button>
          <button
            type="button"
            disabled={page >= totalPages || loading}
            onClick={() => onPageChange(totalPages)}
            className={navBtnClass(page >= totalPages)}
          >
            »»
          </button>
        </div>
      )}
    </div>
  );
}
