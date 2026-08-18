import { TableHead } from "./table";
import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SortableTableHeadProps {
  column: string;
  children: React.ReactNode;
  sortColumn: string | null;
  sortDirection: "asc" | "desc" | null;
  onSort: (column: string) => void;
  className?: string;
  align?: "left" | "center" | "right";
}

export function SortableTableHead({
  column,
  children,
  sortColumn,
  sortDirection,
  onSort,
  className,
  align = "right",
}: SortableTableHeadProps) {
  const isActive = sortColumn === column;
  const alignClass = align === "center" ? "text-center" : align === "left" ? "text-left" : "text-right";

  return (
    <TableHead
      className={cn(
        "font-semibold cursor-pointer select-none hover:bg-muted/50 transition-colors",
        alignClass,
        className
      )}
      onClick={() => onSort(column)}
    >
      <div className={cn("flex items-center gap-2", align === "center" && "justify-center", align === "left" && "justify-start", align === "right" && "justify-end")}>
        <span>{children}</span>
        <div className="flex-shrink-0">
          {!isActive && <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground/50" />}
          {isActive && sortDirection === "asc" && (
            <ArrowUp className="h-3.5 w-3.5 text-primary" />
          )}
          {isActive && sortDirection === "desc" && (
            <ArrowDown className="h-3.5 w-3.5 text-primary" />
          )}
        </div>
      </div>
    </TableHead>
  );
}
