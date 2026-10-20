import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export type TodoFilter = "all" | "active" | "completed";

export function TodoFilters({
  filter,
  onChange,
  active,
  completed,
}: {
  filter: TodoFilter;
  onChange: (filter: TodoFilter) => void;
  active: number;
  completed: number;
}) {
  const options: { value: TodoFilter; label: string; count: number }[] = [
    { value: "all", label: "All", count: active + completed },
    { value: "active", label: "Active", count: active },
    { value: "completed", label: "Completed", count: completed },
  ];

  return (
    <div
      className="flex items-center gap-1"
      role="group"
      aria-label="Filter todos"
    >
      {options.map((option) => (
        <Button
          key={option.value}
          variant={filter === option.value ? "secondary" : "ghost"}
          size="sm"
          aria-pressed={filter === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
          <Badge variant="secondary" className="ml-2">
            {option.count}
          </Badge>
        </Button>
      ))}
    </div>
  );
}
