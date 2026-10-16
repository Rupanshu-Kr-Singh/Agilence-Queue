import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
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
  Plus,
  RefreshCw,
  ShieldCheck,
  Stethoscope,
  UserRound,
  UsersRound,
  X,
} from 'lucide-react';
import {
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

type Role = 'admin' | 'receptionist' | 'doctor';

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

function Home() {
  const [role, setRole] = useState<Role>('receptionist');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [issueDescription, setIssueDescription] = useState('');
  const [mutationError, setMutationError] = useState('');
  const [connection, setConnection] = useState<'connecting' | 'live' | 'offline'>('connecting');
  const queryClient = useQueryClient();
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
          <div className="role-switch" role="group" aria-label="Choose a demo role view">
            <button className={role === 'admin' ? 'selected' : ''} onClick={() => setRole('admin')} data-testid="button-role-admin">
              <ShieldCheck size={15} /> Owner
            </button>
            <button className={role === 'receptionist' ? 'selected' : ''} onClick={() => setRole('receptionist')} data-testid="button-role-receptionist">
              <UserRound size={15} /> Reception
            </button>
            <button className={role === 'doctor' ? 'selected' : ''} onClick={() => setRole('doctor')} data-testid="button-role-doctor">
              <Stethoscope size={15} /> Doctor
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

      <div className={`workspace-grid ${role === 'doctor' ? 'doctor-grid' : ''}`}>
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
          {role === 'receptionist' ? (
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
          ) : (
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
        {(role === 'receptionist' || role === 'admin') && (entry.status === 'waiting' || entry.status === 'with_doctor') && (
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

function Router() {
  return (
    // Keep a shared shell (sidebar, navbar) outside the boundary so it
    // survives a page crash.
    <RoutedErrorBoundary>
      <Switch>
          <Route path="/" component={Home} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
