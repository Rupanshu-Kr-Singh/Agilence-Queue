import { type FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  ClerkProvider,
  SignIn,
  SignUp,
  useAuth,
  useClerk,
} from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import {
  getGetTodayQueueQueryKey,
  useAddQueueEntry,
  useCallNextPatient,
  useCancelQueueEntry,
  useCompleteQueueEntry,
  useGetTodayQueue,
  type AddClinicMemberInput,
  type ClinicMember,
  type CurrentClinicUser,
} from '@workspace/api-client-react';
import type { QueueEntry, QueueEntryInput } from '@workspace/api-client-react';
import {
  Activity,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock3,
  HeartPulse,
  LoaderCircle,
  LogOut,
  Plus,
  RefreshCw,
  ShieldCheck,
  Stethoscope,
  UsersRound,
  X,
} from 'lucide-react';
import {
  Redirect,
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 10_000, refetchOnWindowFocus: true },
  },
});

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

if (!clerkPubKey) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY.');
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: '#276c59',
    colorForeground: '#203832',
    colorMutedForeground: '#63766d',
    colorDanger: '#a84d46',
    colorBackground: '#ffffff',
    colorInput: '#ffffff',
    colorInputForeground: '#203832',
    colorNeutral: '#d9e5dd',
    fontFamily: 'DM Sans, sans-serif',
    borderRadius: '12px',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-white rounded-2xl w-[430px] max-w-full overflow-hidden shadow-xl',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'text-[#203832] font-semibold',
    headerSubtitle: 'text-[#63766d]',
    socialButtonsBlockButtonText: 'text-[#203832] font-medium',
    formFieldLabel: 'text-[#334b42] font-medium',
    footerActionLink: 'text-[#276c59] font-semibold',
    footerActionText: 'text-[#63766d]',
    dividerText: 'text-[#63766d]',
    formButtonPrimary: 'bg-[#276c59] hover:bg-[#1c5948] text-white font-semibold',
    formFieldInput: 'bg-white text-[#203832] border-[#d9e5dd]',
    alertText: 'text-[#a84d46]',
  },
};

type Role = CurrentClinicUser['role'];

const statusCopy: Record<QueueEntry['status'], string> = {
  waiting: 'Waiting',
  with_doctor: 'With doctor',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

function formatTime(value?: string | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}

function formatDate(value?: string) {
  const date = value ? new Date(value) : new Date();
  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

function Home({ member }: { member: CurrentClinicUser }) {
  const role = member.role;
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [issueDescription, setIssueDescription] = useState('');
  const [mutationError, setMutationError] = useState('');
  const [connection, setConnection] = useState<'connecting' | 'live' | 'offline'>('connecting');
  const queryClient = useQueryClient();
  const { signOut } = useClerk();
  const { data: snapshot, isLoading, isError, refetch, isFetching } = useGetTodayQueue();
  const addEntry = useAddQueueEntry();
  const callNext = useCallNextPatient();
  const completeEntry = useCompleteQueueEntry();
  const cancelEntry = useCancelQueueEntry();
  const queueKey = getGetTodayQueueQueryKey();

  useEffect(() => {
    const stream = new EventSource('/api/queue/events');
    stream.onopen = () => {
      setConnection('live');
      void queryClient.refetchQueries({ queryKey: queueKey, type: 'active' });
    };
    stream.addEventListener('queue-updated', () => {
      void queryClient.invalidateQueries({ queryKey: queueKey });
    });
    stream.onerror = () => setConnection('offline');
    return () => stream.close();
  }, [queryClient]);

  const entries = snapshot?.entries ?? [];
  const current = entries.find((entry) => entry.status === 'with_doctor');
  const waiting = useMemo(
    () => entries.filter((entry) => entry.status === 'waiting').sort((a, b) => a.queueNumber - b.queueNumber),
    [entries],
  );
  const receptionistEntries = entries;
  const anyPending = addEntry.isPending || callNext.isPending || completeEntry.isPending || cancelEntry.isPending;

  const invalidateQueue = () => queryClient.invalidateQueries({ queryKey: queueKey });
  const handleError = () => {
    setMutationError('That update could not be saved. Please try again.');
  };
  const submitPatient = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMutationError('');
    const input: QueueEntryInput = {
      name: name.trim(),
      issueDescription: issueDescription.trim(),
      ...(phone.trim() ? { phone: phone.trim() } : {}),
    };
    addEntry.mutate({ data: input }, {
      onSuccess: () => {
        setName('');
        setPhone('');
        setIssueDescription('');
        void invalidateQueue();
      },
      onError: handleError,
    });
  };
  const callNextPatient = () => {
    setMutationError('');
    callNext.mutate(undefined, { onSuccess: () => void invalidateQueue(), onError: handleError });
  };
  const completePatient = (entryId: string) => {
    setMutationError('');
    completeEntry.mutate({ entryId }, { onSuccess: () => void invalidateQueue(), onError: handleError });
  };
  const cancelPatient = (entryId: string) => {
    setMutationError('');
    cancelEntry.mutate({ entryId }, { onSuccess: () => void invalidateQueue(), onError: handleError });
  };

  if (isLoading) {
    return (
      <main className="app-shell">
        <div className="loading-shell" aria-label="Loading today's queue">
          <div className="loading-top shimmer" />
          <div className="loading-stats"><i className="shimmer" /><i className="shimmer" /><i className="shimmer" /></div>
          <div className="loading-content"><i className="shimmer" /><i className="shimmer" /></div>
        </div>
      </main>
    );
  }

  if (isError || !snapshot) {
    return (
      <main className="app-shell error-shell">
        <div className="error-card">
          <div className="error-icon"><Activity size={22} /></div>
          <p className="eyebrow">QUEUE UNAVAILABLE</p>
          <h1>We couldn’t load today’s queue.</h1>
          <p>Check your connection and try again. Your clinic queue will be right here.</p>
          <button className="button button-primary" data-testid="button-retry-queue" onClick={() => void refetch()}>
            <RefreshCw size={17} /> Try again
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark"><HeartPulse size={21} strokeWidth={2.2} /></div>
          <div>
            <div className="brand-name">agilence<span>queue</span></div>
            <div className="brand-caption">CLINIC FLOW, MADE SIMPLE</div>
          </div>
        </div>
        <div className="topbar-right">
          <div className={`live-indicator ${connection === 'offline' ? 'is-offline' : ''}`} data-testid="status-live-connection">
            <span className="live-dot" />
            {connection === 'live' ? 'Live queue' : connection === 'offline' ? 'Reconnecting' : 'Connecting'}
          </div>
          <div className="account-actions">
            <div className="account-details">
              <span className="account-name">{member.displayName}</span>
              <span className={`account-role role-${role}`}>
                {role === 'admin' ? 'Owner' : role === 'assistant' ? 'Reception' : 'Doctor'}
              </span>
            </div>
            <button
              className="sign-out-button"
              onClick={() => void signOut({ redirectUrl: basePath || '/' })}
              data-testid="button-sign-out"
            >
              <LogOut size={15} /> <span>Sign out</span>
            </button>
          </div>
        </div>
      </header>

      <section className="welcome-row">
        <div>
          <div className="eyebrow">{role === 'doctor' ? 'DOCTOR VIEW' : role === 'admin' ? 'CLINIC OWNER' : 'RECEPTION DESK'} <span className="eyebrow-separator">/</span> TODAY</div>
          <h1>{snapshot.clinicName}</h1>
          <p className="date-line">{formatDate(snapshot.serviceDate)}</p>
        </div>
        <button className="refresh-button" onClick={() => void refetch()} disabled={isFetching} data-testid="button-refresh-queue" aria-label="Refresh queue">
          <RefreshCw size={16} className={isFetching ? 'refreshing' : ''} />
          <span>{isFetching ? 'Updating' : 'Refresh'}</span>
        </button>
      </section>

      <section className="metric-strip" aria-label="Today's queue summary">
        <div className="metric-card metric-waiting">
          <div className="metric-icon"><UsersRound size={18} /></div>
          <div className="metric-copy"><span>In the queue</span><strong data-testid="value-waiting-count">{snapshot.waitingCount}</strong></div>
          <span className="metric-footnote">waiting now</span>
        </div>
        <div className="metric-card metric-completed">
          <div className="metric-icon"><CheckCircle2 size={18} /></div>
          <div className="metric-copy"><span>Seen today</span><strong data-testid="value-completed-today">{snapshot.completedToday}</strong></div>
          <span className="metric-footnote">completed</span>
        </div>
        <div className="metric-card metric-wait">
          <div className="metric-icon"><Clock3 size={18} /></div>
          <div className="metric-copy"><span>Average wait</span><strong data-testid="value-average-wait">{snapshot.averageWaitMinutes == null ? '—' : `${snapshot.averageWaitMinutes}`}<small>{snapshot.averageWaitMinutes == null ? '' : ' min'}</small></strong></div>
          <span className="metric-footnote">today so far</span>
        </div>
      </section>

      <div className={`workspace-grid ${role === 'doctor' ? 'doctor-grid' : ''} ${role === 'admin' ? 'admin-grid' : ''}`}>
        <section className="queue-panel panel">
          <div className="panel-heading">
            <div>
              <div className="panel-kicker">LIVE LIST</div>
              <h2>Today’s queue <span className="count-pill" data-testid="value-visible-queue">{waiting.length}</span></h2>
            </div>
            <span className="sort-note">Oldest first</span>
          </div>
          {mutationError && <div className="inline-error" role="alert" data-testid="text-mutation-error">{mutationError}</div>}
          {(role === 'doctor' ? waiting.length === 0 : receptionistEntries.length === 0) ? (
            <div className="queue-empty" data-testid="empty-waiting-queue">
              <div className="empty-symbol"><Check size={21} /></div>
              <h3>All caught up</h3>
              <p>There’s no one waiting right now. New arrivals will appear here.</p>
            </div>
          ) : (
            <div className="queue-list">
              {(role === 'doctor' ? waiting : receptionistEntries).map((entry) => {
                const waitingPosition = waiting.findIndex((waitingEntry) => waitingEntry.id === entry.id) + 1;
                return (
                  <QueueRow
                    key={entry.id}
                    entry={entry}
                    positionLabel={
                      entry.status === 'with_doctor'
                        ? 'With doctor'
                        : entry.status === 'completed'
                          ? 'Seen today'
                          : entry.status === 'cancelled'
                            ? 'Cancelled'
                            : waitingPosition === 1
                              ? 'Next up'
                              : `#${waitingPosition} in line`
                    }
                    role={role}
                    onCancel={() => cancelPatient(entry.id)}
                    disabled={anyPending}
                  />
                );
              })}
            </div>
          )}
        </section>

        <aside className="action-column">
          {role !== 'doctor' && (
            <section className="add-panel panel">
              <div className="panel-heading add-heading">
                <div>
                  <div className="panel-kicker">QUICK CHECK-IN</div>
                  <h2>Add a patient</h2>
                </div>
                <div className="add-icon"><Plus size={19} /></div>
              </div>
              <p className="panel-description">A few details and they’re in the queue.</p>
              <form className="patient-form" onSubmit={submitPatient}>
                <label htmlFor="patient-name">Patient name <span>Required</span></label>
                <input id="patient-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={120} placeholder="e.g. Meera Shah" required data-testid="input-patient-name" />
                <label htmlFor="patient-phone">Phone number <span>Optional</span></label>
                <input id="patient-phone" value={phone} onChange={(event) => setPhone(event.target.value)} maxLength={30} inputMode="tel" placeholder="+91 98765 43210" data-testid="input-patient-phone" />
                <label htmlFor="patient-issue">Reason for visit <span>Required</span></label>
                <textarea id="patient-issue" value={issueDescription} onChange={(event) => setIssueDescription(event.target.value)} maxLength={240} placeholder="Briefly describe what they need help with" rows={3} required data-testid="input-patient-issue" />
                <button type="submit" className="button button-primary add-submit" disabled={!name.trim() || !issueDescription.trim() || anyPending} data-testid="button-add-patient">
                  {addEntry.isPending ? <LoaderCircle size={17} className="spin" /> : <Plus size={17} />}
                  {addEntry.isPending ? 'Adding to queue…' : 'Add to queue'}
                </button>
              </form>
              <div className="privacy-note"><ShieldCheck size={15} /> Only essential visit details are collected.</div>
            </section>
          )}
          {role !== 'assistant' && (
            <DoctorPanel
              current={current}
              waitingCount={waiting.length}
              pending={anyPending}
              calling={callNext.isPending}
              completing={completeEntry.isPending}
              onCallNext={callNextPatient}
              onComplete={completePatient}
              onCancel={cancelPatient}
            />
          )}
          {role === 'admin' && <StaffAccessPanel />}

          <section className="how-panel">
            <div className="how-icon"><Activity size={16} /></div>
            <div><strong>One queue, shared live</strong><p>Updates appear for reception and the doctor as they happen.</p></div>
            <ArrowRight size={15} className="how-arrow" />
          </section>
        </aside>
      </div>
      <footer className="app-footer">
        <span><span className="footer-mark" /> Agilence Queue</span>
        <span>Simple care, one patient at a time.</span>
      </footer>
    </main>
  );
}

class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function readApiResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
  };
  if (!response.ok) {
    throw new ApiRequestError(
      payload.error || 'That request could not be completed.',
      response.status,
    );
  }
  return payload as T;
}

function StaffAccessPanel() {
  const queryClient = useQueryClient();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<AddClinicMemberInput['role']>('assistant');
  const [formMessage, setFormMessage] = useState('');
  const { data, isLoading, isError, error } = useQuery<{ members: ClinicMember[] }>({
    queryKey: ['clinic-members'],
    queryFn: async () => readApiResponse(await fetch('/api/auth/members', {
      credentials: 'same-origin',
    })),
  });
  const addMember = useMutation({
    mutationFn: async (input: AddClinicMemberInput) =>
      readApiResponse<{ member: ClinicMember }>(
        await fetch('/api/auth/members', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        }),
      ),
    onSuccess: async () => {
      setDisplayName('');
      setEmail('');
      setFormMessage('Access added. They can sign up using this email address.');
      await queryClient.invalidateQueries({ queryKey: ['clinic-members'] });
    },
    onError: (reason) => {
      setFormMessage(reason instanceof Error ? reason.message : 'Could not add staff access.');
    },
  });

  const submitMember = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormMessage('');
    addMember.mutate({
      displayName: displayName.trim(),
      email: email.trim().toLowerCase(),
      role,
    });
  };

  return (
    <section className="staff-panel panel">
      <div className="panel-heading">
        <div>
          <div className="panel-kicker">OWNER TOOLS</div>
          <h2>Staff access</h2>
        </div>
        <div className="staff-emblem"><UsersRound size={18} /></div>
      </div>
      <p className="panel-description">Add a verified email and role. Staff sign in with that same email to open their dashboard.</p>
      <form className="staff-form" onSubmit={submitMember}>
        <label htmlFor="staff-name">Staff name</label>
        <input
          id="staff-name"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          maxLength={120}
          placeholder="e.g. Priya Sharma"
          required
        />
        <label htmlFor="staff-email">Email address</label>
        <input
          id="staff-email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          maxLength={254}
          placeholder="name@clinic.com"
          required
        />
        <label htmlFor="staff-role">Role</label>
        <select
          id="staff-role"
          value={role}
          onChange={(event) => setRole(event.target.value as AddClinicMemberInput['role'])}
        >
          <option value="assistant">Receptionist</option>
          <option value="doctor">Doctor</option>
        </select>
        <button
          className="button button-primary staff-submit"
          type="submit"
          disabled={!displayName.trim() || !email.trim() || addMember.isPending}
        >
          {addMember.isPending ? <LoaderCircle size={16} className="spin" /> : <Plus size={16} />}
          {addMember.isPending ? 'Saving access…' : 'Add staff access'}
        </button>
      </form>
      {formMessage && <p className="staff-message" role="status">{formMessage}</p>}
      <div className="staff-list-heading">
        <strong>Clinic accounts</strong>
        {isLoading && <LoaderCircle size={15} className="spin" />}
      </div>
      {isError ? (
        <p className="staff-message" role="alert">{error instanceof Error ? error.message : 'Could not load staff.'}</p>
      ) : (
        <ul className="staff-list">
          {(data?.members ?? []).map((member) => (
            <li className="staff-row" key={member.id}>
              <div className="staff-identity">
                <strong>{member.displayName}</strong>
                <span>{member.email}</span>
              </div>
              <div className="staff-status">
                <span className={`staff-role role-${member.role}`}>
                  {member.role === 'admin' ? 'Owner' : member.role === 'assistant' ? 'Reception' : 'Doctor'}
                </span>
                <span className={member.hasAccount ? 'account-linked' : 'account-pending'}>
                  {member.hasAccount ? 'Active' : 'Sign-up pending'}
                </span>
              </div>
            </li>
          ))}
          {!isLoading && data?.members.length === 0 && (
            <li className="staff-empty">No staff access has been added yet.</li>
          )}
        </ul>
      )}
    </section>
  );
}

function QueueRow({ entry, positionLabel, role, onCancel, disabled }: {
  entry: QueueEntry;
  positionLabel: string;
  role: Role;
  onCancel: () => void;
  disabled: boolean;
}) {
  return (
    <article className="queue-row" data-testid={`row-queue-entry-${entry.id}`}>
      <div className="queue-number" data-testid={`value-queue-number-${entry.id}`}>{String(entry.queueNumber).padStart(2, '0')}</div>
      <div className="patient-details">
        <div className="patient-name-line">
          <h3 data-testid={`text-patient-name-${entry.id}`}>{entry.name}</h3>
          <span className={`status-badge status-${entry.status}`} data-testid={`status-queue-entry-${entry.id}`}>{statusCopy[entry.status]}</span>
        </div>
        <p className="issue-line" data-testid={`text-patient-issue-${entry.id}`}>{entry.issueDescription}</p>
        <div className="patient-meta">
          <span><Clock3 size={13} /> Joined {formatTime(entry.createdAt)}</span>
          {entry.phone && <span>{entry.phone}</span>}
        </div>
      </div>
      <div className="row-actions">
        <span className="position-label">{positionLabel}</span>
        {(role === 'assistant' || role === 'admin') && (entry.status === 'waiting' || entry.status === 'with_doctor') && (
          <button className="icon-button" onClick={onCancel} disabled={disabled} aria-label={`Cancel ${entry.name}`} title="Cancel check-in" data-testid={`button-cancel-${entry.id}`}>
            <X size={17} />
          </button>
        )}
      </div>
    </article>
  );
}

function DoctorPanel({ current, waitingCount, pending, calling, completing, onCallNext, onComplete, onCancel }: {
  current?: QueueEntry;
  waitingCount: number;
  pending: boolean;
  calling: boolean;
  completing: boolean;
  onCallNext: () => void;
  onComplete: (entryId: string) => void;
  onCancel: (entryId: string) => void;
}) {
  return (
    <section className="doctor-panel panel">
      <div className="panel-heading">
        <div><div className="panel-kicker">CONSULTATION</div><h2>At the clinic</h2></div>
        <div className="doctor-emblem"><Stethoscope size={19} /></div>
      </div>
      {current ? (
        <div className="current-patient" data-testid="card-current-patient">
          <div className="current-label"><span className="current-indicator" /> CURRENT PATIENT</div>
          <div className="current-number" data-testid="value-current-queue-number">{String(current.queueNumber).padStart(2, '0')}</div>
          <h3 data-testid="text-current-patient-name">{current.name}</h3>
          <p className="current-issue" data-testid="text-current-patient-issue">{current.issueDescription}</p>
          {current.phone && <p className="current-phone">{current.phone}</p>}
          <div className="called-time"><Clock3 size={14} /> Called at {formatTime(current.calledAt)}</div>
          <button className="button button-primary complete-button" onClick={() => onComplete(current.id)} disabled={pending} data-testid="button-complete-patient">
            {completing ? <LoaderCircle size={17} className="spin" /> : <CheckCircle2 size={17} />}
            {completing ? 'Saving…' : 'Complete consultation'}
          </button>
          <button className="text-action" onClick={() => onCancel(current.id)} disabled={pending} data-testid="button-cancel-current">Cancel this visit</button>
        </div>
      ) : (
        <div className="no-current" data-testid="empty-current-patient">
          <div className="empty-symbol"><Stethoscope size={20} /></div>
          <h3>Ready for the next patient?</h3>
          <p>Call someone from the waiting queue when you’re ready.</p>
        </div>
      )}
      <div className="next-patient-box">
        <div className="next-patient-copy">
          <span>WAITING</span>
          <strong data-testid="doctor-waiting-count">{waitingCount} <small>{waitingCount === 1 ? 'patient' : 'patients'}</small></strong>
        </div>
        <button className="button button-call" onClick={onCallNext} disabled={!waitingCount || pending} data-testid="button-call-next">
          {calling ? <LoaderCircle size={17} className="spin" /> : <ArrowRight size={17} />}
          {calling ? 'Calling…' : 'Call next'}
        </button>
      </div>
    </section>
  );
}

function AuthLoading() {
  return (
    <main className="auth-loading">
      <div className="loading-mark"><HeartPulse size={22} /></div>
      <LoaderCircle size={20} className="spin" />
      <p>Checking your clinic access…</p>
    </main>
  );
}

function LandingPage() {
  const [, setLocation] = useLocation();
  return (
    <main className="landing-shell">
      <header className="landing-header">
        <div className="brand-lockup">
          <div className="brand-mark"><HeartPulse size={21} strokeWidth={2.2} /></div>
          <div>
            <div className="brand-name">agilence<span>queue</span></div>
            <div className="brand-caption">CLINIC FLOW, MADE SIMPLE</div>
          </div>
        </div>
        <button className="button button-light" onClick={() => setLocation('/sign-in')}>
          Staff sign in
        </button>
      </header>
      <section className="landing-content">
        <div className="landing-copy">
          <span className="landing-kicker"><span /> A SIMPLE QUEUE FOR LOCAL CLINICS</span>
          <h1>Less waiting-room confusion. More time for care.</h1>
          <p>Reception and doctors share one live queue. Check in walk-ins, call the next patient, and keep the day moving.</p>
          <div className="landing-actions">
            <button className="button button-primary landing-primary" onClick={() => setLocation('/sign-in')}>
              Sign in to your clinic <ArrowRight size={17} />
            </button>
            <button className="landing-secondary" onClick={() => setLocation('/sign-up')}>
              Create a staff account
            </button>
          </div>
          <div className="landing-note"><ShieldCheck size={16} /> Staff access is assigned by the clinic owner.</div>
        </div>
        <div className="landing-preview" aria-label="Example live queue preview">
          <div className="preview-topline"><span className="preview-dot" /> TODAY’S CLINIC QUEUE <span className="preview-live">LIVE</span></div>
          <div className="preview-card preview-current">
            <div className="preview-queue-number">02</div>
            <div><span className="preview-label">WITH DOCTOR</span><strong>Meera Patel</strong><small>Seasonal cough</small></div>
          </div>
          <div className="preview-card">
            <div className="preview-queue-number preview-muted">03</div>
            <div><span className="preview-label">WAITING</span><strong>Kabir Nair</strong><small>Fever and tiredness</small></div>
          </div>
          <div className="preview-footer"><UsersRound size={16} /> Reception and doctor stay in sync automatically.</div>
        </div>
      </section>
      <footer className="landing-footer">Agilence Queue <span>Simple care, one patient at a time.</span></footer>
    </main>
  );
}

function HomeRedirect() {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return <AuthLoading />;
  return isSignedIn ? <Redirect to="/dashboard" /> : <LandingPage />;
}

function DashboardRoute() {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return <AuthLoading />;
  if (!isSignedIn) return <Redirect to="/" />;
  return <ClinicDashboardRoute />;
}

function ClinicDashboardRoute() {
  const query = useQuery({
    queryKey: ['auth', 'current-clinic-user'],
    queryFn: async () =>
      readApiResponse<{ user: CurrentClinicUser }>(
        await fetch('/api/auth/me', { credentials: 'same-origin' }),
      ),
    retry: false,
    staleTime: 30_000,
  });

  if (query.isLoading) return <AuthLoading />;

  if (query.isError) {
    const status = query.error instanceof ApiRequestError ? query.error.status : 0;
    if (status === 401 || status === 403) {
      return <ClinicAccessRequired />;
    }
    return (
      <main className="auth-loading auth-error-state">
        <div className="access-icon"><Activity size={21} /></div>
        <h1>We couldn’t check your clinic access.</h1>
        <p>Check your connection and try again.</p>
        <button className="button button-primary" onClick={() => void query.refetch()}>
          <RefreshCw size={16} /> Try again
        </button>
      </main>
    );
  }

  return query.data ? <Home member={query.data.user} /> : <ClinicAccessRequired />;
}

function ClinicAccessRequired() {
  const { signOut } = useClerk();
  return (
    <main className="auth-loading access-required">
      <div className="access-icon"><ShieldCheck size={22} /></div>
      <div className="panel-kicker">CLINIC ACCESS</div>
      <h1>Your account isn’t assigned to this clinic yet.</h1>
      <p>Ask the clinic owner to add the same verified email you used to sign in. Once assigned, sign out and sign back in.</p>
      <button
        className="button button-primary"
        onClick={() => void signOut({ redirectUrl: basePath || '/' })}
      >
        <LogOut size={16} /> Sign out
      </button>
    </main>
  );
}

function SignInPage() {
  return (
    <main className="auth-page">
      <a className="auth-back-link" href={basePath || '/'}>← Back to Agilence Queue</a>
      <SignIn
        routing="path"
        path={`${basePath}/sign-in`}
        signUpUrl={`${basePath}/sign-up`}
        forceRedirectUrl={`${basePath}/dashboard`}
      />
    </main>
  );
}

function SignUpPage() {
  return (
    <main className="auth-page">
      <a className="auth-back-link" href={basePath || '/'}>← Back to Agilence Queue</a>
      <SignUp
        routing="path"
        path={`${basePath}/sign-up`}
        signInUrl={`${basePath}/sign-in`}
        forceRedirectUrl={`${basePath}/dashboard`}
      />
    </main>
  );
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const queryClient = useQueryClient();
  const previousUserId = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (previousUserId.current !== undefined && previousUserId.current !== userId) {
        queryClient.clear();
      }
      previousUserId.current = userId;
    });
    return unsubscribe;
  }, [addListener, queryClient]);

  return null;
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: {
          start: {
            title: 'Welcome back',
            subtitle: 'Sign in to your clinic account',
          },
        },
        signUp: {
          start: {
            title: 'Create your staff account',
            subtitle: 'Ask the clinic owner to assign your role',
          },
        },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <TooltipProvider>
          <RoutedErrorBoundary>
            <Switch>
              <Route path="/" component={HomeRedirect} />
              <Route path="/dashboard" component={DashboardRoute} />
              <Route path="/sign-in/*?" component={SignInPage} />
              <Route path="/sign-up/*?" component={SignUpPage} />
              <Route component={NotFound} />
            </Switch>
          </RoutedErrorBoundary>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || '/'
    : path;
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}

export default App;
