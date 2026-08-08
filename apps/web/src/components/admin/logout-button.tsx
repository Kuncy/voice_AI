export function LogoutButton() {
  return (
    <form action="/api/admin/logout" method="post">
      <button className="nav-logout" type="submit">Abmelden</button>
    </form>
  );
}
