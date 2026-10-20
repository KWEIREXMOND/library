import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, BookOpen, LogOut, Menu, ShieldCheck, X } from 'lucide-react';
import { Brand, SchoolCrest } from './Brand';
import { Avatar, Button } from './ui';
import { AccountMenu } from './AccountMenu';
import { NoticeBanner } from './NoticeBanner';
import { useAuth } from '../lib/auth';
import { publicLinks } from '../lib/nav';

export function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [pathname]);
  return null;
}

function SiteHeader() {
  const { user, settings, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const staff = user?.role === 'librarian' || user?.role === 'admin';
  useEffect(() => setMobileOpen(false), [location.pathname]);

  const signOut = async () => {
    await logout();
    navigate('/', { replace: true });
  };

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-ink/10 bg-parchment/85 backdrop-blur-md">
        <div className="container-x flex h-[72px] items-center gap-4">
          <Brand />
          <nav className="ml-6 hidden items-center gap-1 lg:flex">
            {publicLinks.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.to === '/'}
                className={({ isActive }) => `rounded-full px-4 py-2 text-[13px] font-semibold transition ${
                  isActive ? 'bg-forest-700/10 text-forest-800' : 'text-ink-soft hover:bg-ink/[0.045] hover:text-ink'
                }`}
              >
                {link.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            {user ? (
              <>
                <Link to={staff ? '/app' : '/books'} className="hidden sm:block">
                  <Button size="sm" variant="primary" icon={ArrowRight}>{staff ? 'Staff dashboard' : 'My library'}</Button>
                </Link>
                <AccountMenu />
              </>
            ) : (
              <>
                <Link to="/login" className="hidden rounded-lg px-3 py-2 text-[13px] font-semibold text-ink-soft hover:text-ink sm:block">Sign in</Link>
                <Link to="/register" className="hidden sm:block"><Button size="sm" variant="primary">Get a library ID</Button></Link>
              </>
            )}
            <button
              onClick={() => setMobileOpen((open) => !open)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-ink/10 bg-white/60 text-ink-soft lg:hidden"
              aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            >
              {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </header>

      {mobileOpen ? (
        <div className="fixed inset-0 top-[72px] z-30 overflow-y-auto bg-parchment/98 backdrop-blur-xl lg:hidden">
          <div className="container-x py-6">
            <div className="flex flex-col divide-y divide-ink/10 border-y border-ink/10">
              {publicLinks.map((link) => (
                <Link key={link.to} to={link.to} className="flex items-center justify-between py-4 font-display text-2xl text-ink">
                  {link.label}
                  <ArrowUpRight className="h-4 w-4 text-ink-mute" />
                </Link>
              ))}
              {staff ? (
                <Link to="/kiosk" className="flex items-center justify-between py-4 font-display text-2xl text-ink">
                  Kiosk screen
                  <ArrowUpRight className="h-4 w-4 text-ink-mute" />
                </Link>
              ) : null}
            </div>
            <div className="mt-6 flex flex-col gap-2">
              {user ? (
                <>
                  <Link to={staff ? '/app' : '/books'}><Button className="w-full" size="lg">{staff ? 'Open the staff dashboard' : 'Open my library'}</Button></Link>
                  <div className="flex items-center justify-between gap-2 rounded-xl border border-ink/10 bg-white/70 px-3 py-2.5">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <Avatar firstName={user.firstName} lastName={user.lastName} hue={user.avatarHue} size="sm" />
                      <div className="min-w-0">
                        <p className="truncate text-[12.5px] font-semibold text-ink">{user.firstName} {user.lastName}</p>
                        <p className="truncate text-[11px] text-ink-mute">{user.libraryId}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={signOut}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold text-clay-700 transition hover:bg-clay-50"
                    >
                      <LogOut className="h-3.5 w-3.5" /> Sign out
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <Link to="/login"><Button variant="secondary" className="w-full" size="lg">Sign in with my library ID</Button></Link>
                  <Link to="/register"><Button className="w-full" size="lg">Get a library ID</Button></Link>
                </>
              )}
            </div>
            <div className="mt-10 flex items-center gap-3 text-[12px] text-ink-mute">
              <SchoolCrest className="h-8 w-8" />
              <span>{settings?.schoolName ?? 'Tema Secondary School'} · Greater Accra, Ghana</span>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function SiteFooter() {
  const { settings } = useAuth();
  const year = new Date().getFullYear();
  return (
    <footer className="mt-20 border-t border-ink/10 bg-forest-950 text-parchment">
      <div className="container-x grid gap-8 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2">
          <Brand dark />
          <p className="mt-4 max-w-sm text-[13px] leading-relaxed text-parchment/55">
            {settings?.siteDescription?.trim()
              || 'The Tema Secondary School library — sign every visitor in at the door, and read our books online from any device.'}
          </p>
        </div>
        <div>
          <h4 className="text-[10px] font-bold uppercase tracking-[0.18em] text-brass-300/80">Use the library</h4>
          <ul className="mt-4 space-y-2.5 text-[13px] text-parchment/60">
            <li><Link to="/books" className="hover:text-parchment">Online books</Link></li>
            <li><Link to="/login" className="hover:text-parchment">Student sign in</Link></li>
            <li><Link to="/register" className="hover:text-parchment">Get a library ID</Link></li>
            <li><Link to="/login?next=/app" className="hover:text-parchment">Staff sign in</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="text-[10px] font-bold uppercase tracking-[0.18em] text-brass-300/80">Visit us</h4>
          <ul className="mt-4 space-y-2.5 text-[13px] text-parchment/60">
            <li>{settings?.address ?? 'P.O. Box 127, Tema, Greater Accra, Ghana'}</li>
            <li>{settings?.phone ?? '+233 24 555 0182'}</li>
            <li>{settings?.email ?? 'library@tema.edu.gh'}</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-parchment/10">
        <div className="container-x flex flex-col gap-2 py-4 text-[11.5px] text-parchment/35 sm:flex-row sm:items-center sm:justify-between">
          <p>© {year} {settings?.schoolName ?? 'Tema Secondary School'}.</p>
          <p className="flex items-center gap-3">
            <Link to="/login?next=/app" className="inline-flex items-center gap-1.5 hover:text-parchment/70"><ShieldCheck className="h-3.5 w-3.5" /> Staff</Link>
            <span className="h-1 w-1 rounded-full bg-brass-400/60" />
            <Link to="/books" className="inline-flex items-center gap-1.5 hover:text-parchment/70"><BookOpen className="h-3.5 w-3.5" /> Read</Link>
          </p>
        </div>
      </div>
    </footer>
  );
}

export function PublicLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <ScrollToTop />
      <SiteHeader />
      <NoticeBanner />
      <main className="flex-1"><Outlet /></main>
      <SiteFooter />
    </div>
  );
}

export function PageIntro({ eyebrow, title, description, children, aside }: {
  eyebrow?: string; title: React.ReactNode; description?: React.ReactNode; children?: React.ReactNode; aside?: React.ReactNode;
}) {
  return (
    <section className="relative overflow-hidden border-b border-ink/10">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-forest-100/50 via-parchment to-parchment" />
      <div className="pointer-events-none absolute right-0 top-0 h-full w-1/3 bg-grain opacity-[0.07]" />
      <div className="container-x relative py-10 sm:py-14">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
            <h1 className="mt-2 text-balance text-4xl leading-[1.05] text-ink sm:text-[46px]">{title}</h1>
            {description ? <p className="mt-4 max-w-xl text-[14.5px] leading-relaxed text-ink-mute">{description}</p> : null}
          </div>
          {aside}
        </div>
        {children ? <div className="mt-8">{children}</div> : null}
      </div>
    </section>
  );
}

/** A small link back to the public site, used on kiosk-style screens. */
export function PublicBackLink() {
  return (
    <Link to="/" className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-ink-mute hover:text-ink">
      <ArrowUpRight className="h-3.5 w-3.5 rotate-180" /> Library home
    </Link>
  );
}
