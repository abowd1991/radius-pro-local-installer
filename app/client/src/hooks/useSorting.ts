import { useState, useMemo } from "react";

export type SortDirection = "asc" | "desc" | null;

export interface UseSortingReturn<T> {
  sortedData: T[];
  sortColumn: string | null;
  sortDirection: SortDirection;
  handleSort: (column: string) => void;
  getSortIcon: (column: string) => "asc" | "desc" | "both";
}

export function useSorting<T extends Record<string, any>>(
  data: T[] | undefined,
  defaultColumn?: string,
  defaultDirection: SortDirection = "asc"
): UseSortingReturn<T> {
  const [sortColumn, setSortColumn] = useState<string | null>(defaultColumn || null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(defaultDirection);

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      // Cycle through: asc → desc → null
      if (sortDirection === "asc") {
        setSortDirection("desc");
      } else if (sortDirection === "desc") {
        setSortDirection(null);
        setSortColumn(null);
      }
    } else {
      // New column, start with asc
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  const getSortIcon = (column: string): "asc" | "desc" | "both" => {
    if (sortColumn !== column) return "both";
    return sortDirection === "asc" ? "asc" : "desc";
  };

  const sortedData = useMemo(() => {
    if (!data || !sortColumn || !sortDirection) return data || [];

    return [...data].sort((a, b) => {
      const aValue = a[sortColumn];
      const bValue = b[sortColumn];

      // Handle null/undefined
      if (aValue == null && bValue == null) return 0;
      if (aValue == null) return 1;
      if (bValue == null) return -1;

      // Handle numbers
      if (typeof aValue === "number" && typeof bValue === "number") {
        return sortDirection === "asc" ? aValue - bValue : bValue - aValue;
      }

      // Handle dates
      if (aValue instanceof Date && bValue instanceof Date) {
        return sortDirection === "asc"
          ? aValue.getTime() - bValue.getTime()
          : bValue.getTime() - aValue.getTime();
      }

      // Handle strings (case-insensitive)
      const aStr = String(aValue).toLowerCase();
      const bStr = String(bValue).toLowerCase();

      if (sortDirection === "asc") {
        return aStr.localeCompare(bStr);
      } else {
        return bStr.localeCompare(aStr);
      }
    });
  }, [data, sortColumn, sortDirection]);

  return {
    sortedData,
    sortColumn,
    sortDirection,
    handleSort,
    getSortIcon,
  };
}
