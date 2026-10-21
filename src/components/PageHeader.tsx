interface PageHeaderProps {
  title: string;
  description?: string;
}

export default function PageHeader({ title, description }: PageHeaderProps) {
  return (
    <header className="mb-8">
      <h1 className="text-[28px] font-semibold tracking-tight text-zinc-900 leading-tight">
        {title}
      </h1>
      {description ? (
        <p className="mt-1 text-sm text-zinc-500 leading-normal">
          {description}
        </p>
      ) : null}
    </header>
  );
}
