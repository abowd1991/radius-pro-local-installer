import { Search, X, Filter } from "lucide-react";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { cn } from "@/lib/utils";

interface FilterBarProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  activeFilters?: Array<{
    key: string;
    label: string;
    value: string;
  }>;
  onClearFilter?: (key: string) => void;
  onClearAll?: () => void;
  children?: React.ReactNode; // For additional filter controls
  className?: string;
}

export function FilterBar({
  searchValue,
  onSearchChange,
  searchPlaceholder = "بحث...",
  activeFilters = [],
  onClearFilter,
  onClearAll,
  children,
  className,
}: FilterBarProps) {
  const hasActiveFilters = activeFilters.length > 0;

  return (
    <div className={cn("space-y-4", className)}>
      {/* Search & Actions Row */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder={searchPlaceholder}
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pr-10"
          />
          {searchValue && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute left-1 top-1/2 -translate-y-1/2 h-7 w-7"
              onClick={() => onSearchChange("")}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Additional Controls */}
        {children}

        {/* Clear All Button */}
        {hasActiveFilters && onClearAll && (
          <Button
            variant="outline"
            size="sm"
            onClick={onClearAll}
            className="shrink-0"
          >
            <X className="h-4 w-4 ml-2" />
            مسح الفلاتر
          </Button>
        )}
      </div>

      {/* Active Filters Chips */}
      {hasActiveFilters && (
        <div className="flex flex-wrap gap-2 items-center">
          <Filter className="h-4 w-4 text-muted-foreground" />
          {activeFilters.map((filter) => (
            <Badge
              key={filter.key}
              variant="secondary"
              className="gap-1 pr-1 pl-2"
            >
              <span className="text-xs">
                {filter.label}: {filter.value}
              </span>
              {onClearFilter && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-4 w-4 p-0 hover:bg-transparent"
                  onClick={() => onClearFilter(filter.key)}
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
