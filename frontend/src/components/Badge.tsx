import { CATEGORY_META, subcategoryLabel, VISIBILITY_META } from "@/lib/activity";
import type { Category, Visibility } from "@/lib/types";

const BASE =
  "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap";

// Shows the subcategory ("Birthday") when there is one, else the category.
export function CategoryBadge({
  category,
  subcategory,
}: {
  category: Category;
  subcategory?: string;
}) {
  const meta = { ...CATEGORY_META[category], label: subcategoryLabel(category, subcategory) };
  return (
    <span className={`${BASE} bg-surface/85 text-ink shadow-sm`}>
      <span aria-hidden="true">{meta.emoji}</span>
      {meta.label}
    </span>
  );
}

export function VisibilityBadge({ visibility }: { visibility: Visibility }) {
  const meta = VISIBILITY_META[visibility];
  return (
    <span className={`${BASE} bg-black/55 text-white shadow-sm`}>
      <span aria-hidden="true">{meta.emoji}</span>
      {meta.label}
    </span>
  );
}
