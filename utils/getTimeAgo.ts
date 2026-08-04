export default function getTimeAgo(createdAt: string): string {
  if (!createdAt) return "";
  const now = new Date();
  const created = new Date(createdAt);
  const diffInSeconds = Math.floor((now.getTime() - created.getTime()) / 1000);

  if (diffInSeconds < 60) {
    return "hace un momento";
  }

  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) {
    return `hace ${diffInMinutes}m`;
  }

  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) {
    return `hace ${diffInHours}h`;
  }

  const diffInDays = Math.floor(diffInHours / 24);
  return `hace ${diffInDays}d`;
}