import { EmptyState } from "../components/ui";
import { ButtonLink } from "../components/primitives";

export function NotFoundPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-20 sm:px-6">
      <EmptyState
        title="Page not found"
        body="This route doesn't exist. The compute markets are this way."
        action={<ButtonLink to="/markets" arrow>Explore markets</ButtonLink>}
      />
    </div>
  );
}
