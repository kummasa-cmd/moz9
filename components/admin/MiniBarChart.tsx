type BarDatum = {
  label: string;
  value: number;
  display: string;
};

// Literal class list (steps of 5%) so Tailwind's content scanner can detect
// every class at build time even though the index is picked at runtime.
const WIDTH_CLASSES = [
  "w-[0%]", "w-[5%]", "w-[10%]", "w-[15%]", "w-[20%]",
  "w-[25%]", "w-[30%]", "w-[35%]", "w-[40%]", "w-[45%]",
  "w-[50%]", "w-[55%]", "w-[60%]", "w-[65%]", "w-[70%]",
  "w-[75%]", "w-[80%]", "w-[85%]", "w-[90%]", "w-[95%]", "w-full",
];

function widthClass(ratio: number) {
  const step = Math.min(20, Math.max(0, Math.round(ratio * 20)));
  return WIDTH_CLASSES[step];
}

export default function MiniBarChart({ data }: { data: BarDatum[] }) {
  const max = Math.max(...data.map((d) => d.value), 1);

  return (
    <div className="space-y-3">
      {data.map((d) => (
        <div key={d.label} className="flex items-center gap-3">
          <span className="w-16 flex-shrink-0 text-xs text-muted-foreground">{d.label}</span>
          <div className="flex-1 h-2.5 rounded-full bg-muted overflow-hidden">
            <div className={`h-full rounded-full bg-primary ${widthClass(d.value / max)}`} />
          </div>
          <span className="w-24 flex-shrink-0 text-right text-xs font-medium text-foreground">
            {d.display}
          </span>
        </div>
      ))}
    </div>
  );
}
