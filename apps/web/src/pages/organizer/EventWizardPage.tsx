import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { fetchOrganizers } from "../../api/admin";
import { apiErrorMessage } from "../../api/client";
import { eventsApi } from "../../api/events";
import type { EventItem, EventPrivateInfo, RefundPolicy, TicketMode } from "../../api/types";
import { ArtistLineupManager } from "../../components/organizer/ArtistLineupManager";
import { DiscountCodeManager } from "../../components/organizer/DiscountCodeManager";
import { RefundPolicyEditor, SUGGESTED_REFUND_POLICY } from "../../components/organizer/RefundPolicyEditor";
import { SeatMapBuilder } from "../../components/organizer/SeatMapBuilder";
import { ShowtimeManager } from "../../components/organizer/ShowtimeManager";
import { TicketTypeManager } from "../../components/organizer/TicketTypeManager";
import { GalleryField, ImageField } from "../../components/ui/ImageField";
import { PageSpinner } from "../../components/ui/Spinner";
import { categorySupportsLineup } from "../../lib/categories";
import { loadProvinces, type Province } from "../../lib/vnAdminUnits";

type Step = 1 | 2 | 3 | 4;
const STEPS: Array<{ n: Step; label: string }> = [
  { n: 1, label: "Thông tin sự kiện" },
  { n: 2, label: "Thời gian & Loại vé" },
  { n: 3, label: "Cài đặt" },
  { n: 4, label: "Thông tin thanh toán" },
];

interface WizardForm {
  ownerId: string;
  title: string;
  categoryId: string;
  bannerUrl: string;
  organizerLogoUrl: string;
  galleryUrls: string[];
  isOnline: boolean;
  venueName: string;
  province: string;
  ward: string;
  streetAddress: string;
  onlineUrl: string;
  description: string;
  organizerName: string;
  organizerDescription: string;
  startTime: string;
  endTime: string;
  ticketMode: TicketMode;
  maxTicketsPerAccount: string;
  minAge: string;
  terms: string;
  refundPolicy: RefundPolicy;
  payoutAccountHolder: string;
  payoutAccountNumber: string;
  payoutBankName: string;
  payoutBankBranch: string;
  invoiceBusinessType: "INDIVIDUAL" | "COMPANY";
  invoiceName: string;
  invoiceAddress: string;
  invoiceTaxCode: string;
}

const EMPTY: WizardForm = {
  ownerId: "",
  title: "",
  categoryId: "",
  bannerUrl: "",
  organizerLogoUrl: "",
  galleryUrls: [],
  isOnline: false,
  venueName: "",
  province: "",
  ward: "",
  streetAddress: "",
  onlineUrl: "",
  description: "",
  organizerName: "",
  organizerDescription: "",
  startTime: "",
  endTime: "",
  ticketMode: "GENERAL",
  maxTicketsPerAccount: "",
  minAge: "",
  terms: "",
  refundPolicy: SUGGESTED_REFUND_POLICY,
  payoutAccountHolder: "",
  payoutAccountNumber: "",
  payoutBankName: "",
  payoutBankBranch: "",
  invoiceBusinessType: "INDIVIDUAL",
  invoiceName: "",
  invoiceAddress: "",
  invoiceTaxCode: "",
};

/** ISO -> value for <input type="datetime-local"> (local time, minutes precision). */
function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromEvent(event: EventItem, priv: EventPrivateInfo | undefined): WizardForm {
  const s = (v: string | null | undefined) => v ?? "";
  return {
    ...EMPTY,
    ownerId: event.organizerId,
    title: event.title,
    categoryId: event.categoryId,
    bannerUrl: s(event.bannerUrl),
    organizerLogoUrl: s(event.organizerLogoUrl),
    galleryUrls: event.galleryUrls ?? [],
    isOnline: !!event.isOnline,
    venueName: event.venueName,
    province: s(event.province),
    ward: s(event.ward),
    // Older events have only the free-text address — keep it editable in the street field.
    streetAddress: event.province || event.isOnline ? s(event.streetAddress) : event.venueAddress,
    onlineUrl: s(priv?.onlineUrl),
    description: s(event.description),
    organizerName: s(event.organizerName),
    organizerDescription: s(event.organizerDescription),
    startTime: toLocalInput(event.startTime),
    endTime: toLocalInput(event.endTime),
    ticketMode: event.ticketMode,
    maxTicketsPerAccount: event.maxTicketsPerAccount ? String(event.maxTicketsPerAccount) : "",
    minAge: event.minAge != null ? String(event.minAge) : "",
    terms: s(event.terms),
    refundPolicy: event.refundPolicy ?? { customerRefundable: false, tiers: [] },
    payoutAccountHolder: s(priv?.payoutAccountHolder),
    payoutAccountNumber: s(priv?.payoutAccountNumber),
    payoutBankName: s(priv?.payoutBankName),
    payoutBankBranch: s(priv?.payoutBankBranch),
    invoiceBusinessType: priv?.invoiceBusinessType ?? "INDIVIDUAL",
    invoiceName: s(priv?.invoiceName),
    invoiceAddress: s(priv?.invoiceAddress),
    invoiceTaxCode: s(priv?.invoiceTaxCode),
  };
}

/** What the event API stores for the address fields. */
function venueFields(f: WizardForm) {
  if (f.isOnline) {
    return { isOnline: true, venueName: f.venueName.trim() || "Trực tuyến", venueAddress: "Sự kiện trực tuyến", province: "", ward: "", streetAddress: "" };
  }
  return {
    isOnline: false,
    venueName: f.venueName.trim(),
    venueAddress: [f.streetAddress.trim(), f.ward, f.province].filter(Boolean).join(", "),
    province: f.province,
    ward: f.ward,
    streetAddress: f.streetAddress.trim(),
  };
}

function step1Error(f: WizardForm, asAdmin: boolean): string | null {
  if (asAdmin && !f.ownerId) return "Chọn ban tổ chức (đối tác) cho sự kiện.";
  if (!f.title.trim()) return "Nhập tên sự kiện.";
  if (f.isOnline) {
    if (!/^https?:\/\/\S+$/.test(f.onlineUrl.trim())) return "Nhập link tham gia hợp lệ (bắt đầu bằng http:// hoặc https://).";
  } else {
    if (!f.venueName.trim()) return "Nhập tên địa điểm.";
    if (!f.province) return "Chọn Tỉnh/Thành.";
    if (!f.streetAddress.trim()) return "Nhập số nhà, đường.";
  }
  if (!f.categoryId) return "Chọn thể loại sự kiện.";
  if (!f.description.trim()) return "Nhập thông tin sự kiện.";
  return null;
}

function step2Error(f: WizardForm, hasShowtimes: boolean): string | null {
  if (hasShowtimes) return null; // dates come from the showtimes
  if (!f.startTime || !f.endTime) return "Chọn thời gian bắt đầu và kết thúc.";
  if (new Date(f.endTime) <= new Date(f.startTime)) return "Thời gian kết thúc phải sau thời gian bắt đầu.";
  return null;
}

/** Only fields that actually changed — an on-sale event rejects even an unchanged date/venue (events.service.ts update). */
function changed<T extends Record<string, unknown>>(next: T, current: Record<string, unknown>): Partial<T> {
  return Object.fromEntries(Object.entries(next).filter(([k, v]) => JSON.stringify(v ?? "") !== JSON.stringify(current[k] ?? ""))) as Partial<T>;
}

/**
 * Ticketbox-style event creation in four steps — Thông tin sự kiện → Thời
 * gian & Loại vé → Cài đặt → Thông tin thanh toán — each saved on its own
 * ("Lưu" stays, "Tiếp tục" saves and moves on). The draft is created the
 * first time step 2 is saved (an event needs its dates and ticket mode
 * before ticket types can hang off it); from then on the URL is
 * …/su-kien/:id/thiet-lap?buoc=N and every step edits that draft. With
 * `asAdmin`, the admin console uses it to create an event for a partner.
 */
export function EventWizardPage({ asAdmin = false }: { asAdmin?: boolean } = {}) {
  const { id } = useParams();
  const [search, setSearch] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation() as { state?: { notice?: string } };
  const qc = useQueryClient();
  const base = asAdmin ? "/quan-tri/su-kien" : "/kenh-to-chuc/su-kien";
  const step = (Math.min(4, Math.max(1, Number(search.get("buoc")) || 1)) as Step);

  const { data: categories } = useQuery({ queryKey: ["categories"], queryFn: eventsApi.categories });
  const { data: organizers } = useQuery({ queryKey: ["admin", "organizers"], queryFn: fetchOrganizers, enabled: asAdmin && !id });
  const { data: event } = useQuery({ queryKey: ["event", id], queryFn: () => eventsApi.getById(id!), enabled: !!id });
  const { data: priv } = useQuery({ queryKey: ["event-private", id], queryFn: () => eventsApi.privateInfo.get(id!), enabled: !!id });

  const [form, setForm] = useState<WizardForm>({ ...EMPTY, ownerId: search.get("doi-tac") ?? "" });
  const [hydrated, setHydrated] = useState(!id);
  const [error, setError] = useState<string | null>(null);
  // Creating the draft swaps the route (…/moi -> …/:id/thiet-lap), which remounts this page — the message rides along in router state.
  const [notice, setNotice] = useState<string | null>(location.state?.notice ?? null);
  const set = (patch: Partial<WizardForm>) => setForm((f) => ({ ...f, ...patch }));

  useEffect(() => {
    if (!hydrated && event && priv) {
      setForm(fromEvent(event, priv));
      setHydrated(true);
    }
  }, [hydrated, event, priv]);

  const hasShowtimes = (event?.showtimes?.length ?? 0) > 0;
  const policyEditable = !event || event.status === "DRAFT" || event.status === "REJECTED";

  const goTo = (next: Step) => {
    setError(null);
    setSearch((prev) => {
      const params = new URLSearchParams(prev);
      params.set("buoc", String(next));
      return params;
    });
    window.scrollTo({ top: 0 });
  };

  const galleryUrls = form.galleryUrls;
  const optional = (v: string) => (v.trim() ? v.trim() : undefined);

  const save = useMutation({
    mutationFn: async (target: Step): Promise<{ created?: EventItem }> => {
      if (step === 1) {
        const err = step1Error(form, asAdmin);
        if (err) throw new Error(err);
        if (!event) return {}; // nothing to save yet — the draft is created on step 2
        const info = {
          title: form.title.trim(),
          categoryId: form.categoryId,
          bannerUrl: form.bannerUrl,
          organizerLogoUrl: form.organizerLogoUrl,
          galleryUrls,
          description: form.description,
          organizerName: form.organizerName,
          organizerDescription: form.organizerDescription,
          ...venueFields(form),
        };
        const patch = changed(info, event as unknown as Record<string, unknown>);
        if (Object.keys(patch).length > 0) await eventsApi.update(event.id, patch as Partial<EventItem>);
        if (form.isOnline || priv?.onlineUrl) await eventsApi.privateInfo.save(event.id, { onlineUrl: form.isOnline ? form.onlineUrl.trim() : "" });
        return {};
      }

      if (step === 2) {
        const err = step1Error(form, asAdmin) ?? step2Error(form, hasShowtimes);
        if (err) throw new Error(err);
        if (!event) {
          const created = await eventsApi.create({
            ...(asAdmin ? { organizerId: form.ownerId } : {}),
            title: form.title.trim(),
            categoryId: form.categoryId,
            description: form.description,
            bannerUrl: optional(form.bannerUrl),
            organizerLogoUrl: optional(form.organizerLogoUrl),
            organizerName: optional(form.organizerName),
            organizerDescription: optional(form.organizerDescription),
            galleryUrls,
            ...venueFields(form),
            startTime: new Date(form.startTime).toISOString(),
            endTime: new Date(form.endTime).toISOString(),
            ticketMode: form.ticketMode,
            refundPolicy: form.refundPolicy,
          });
          if (form.isOnline) await eventsApi.privateInfo.save(created.id, { onlineUrl: form.onlineUrl.trim() });
          return { created };
        }
        if (!hasShowtimes) {
          const patch = changed(
            { startTime: new Date(form.startTime).toISOString(), endTime: new Date(form.endTime).toISOString() },
            { startTime: event.startTime, endTime: event.endTime },
          );
          if (Object.keys(patch).length > 0) await eventsApi.update(event.id, patch as Partial<EventItem>);
        }
        return {};
      }

      if (!event) throw new Error("Hoàn thành bước 2 để tạo bản nháp trước.");
      if (step === 3) {
        await eventsApi.update(event.id, {
          ...(form.maxTicketsPerAccount ? { maxTicketsPerAccount: Number(form.maxTicketsPerAccount) } : {}),
          minAge: form.minAge ? Number(form.minAge) : null,
          terms: form.terms,
          ...(policyEditable ? { refundPolicy: form.refundPolicy } : {}),
        });
        return {};
      }

      await eventsApi.privateInfo.save(event.id, {
        payoutAccountHolder: form.payoutAccountHolder,
        payoutAccountNumber: form.payoutAccountNumber.trim(),
        payoutBankName: form.payoutBankName,
        payoutBankBranch: form.payoutBankBranch,
        invoiceBusinessType: form.invoiceBusinessType,
        invoiceName: form.invoiceName,
        invoiceAddress: form.invoiceAddress,
        invoiceTaxCode: form.invoiceTaxCode.trim(),
      });
      void target;
      return {};
    },
    onSuccess: ({ created }, target) => {
      setError(null);
      if (created) {
        // Stay on step 2: the draft exists now, so ticket types can be added.
        navigate(`${base}/${created.id}/thiet-lap?buoc=2`, {
          replace: true,
          state: { notice: "Đã tạo bản nháp — thêm loại vé bên dưới rồi bấm Tiếp tục." },
        });
        return;
      }
      if (event) {
        void qc.invalidateQueries({ queryKey: ["event", event.id] });
        void qc.invalidateQueries({ queryKey: ["event-private", event.id] });
      }
      if (step === 4 && target === 4) {
        navigate(`${base}/${event!.id}`);
        return;
      }
      if (target !== step) goTo(target);
      else setNotice(event ? "Đã lưu." : "Bản nháp sẽ được tạo khi bạn lưu thời gian ở bước 2.");
    },
    onError: (err) => {
      setNotice(null);
      setError(err instanceof Error && !("isAxiosError" in err) ? err.message : apiErrorMessage(err, "Không thể lưu."));
    },
  });

  if (id && !hydrated) return <PageSpinner />;

  const done: Record<Step, boolean> = {
    1: !!event,
    2: !!event && (event.ticketMode === "SEATMAP" || (event.ticketTypes?.length ?? 0) > 0),
    3: !!event && step > 3,
    4: !!priv?.payoutAccountNumber,
  };
  const canOpen = (s: Step) => s <= 2 || !!event;

  return (
    <div className="-mt-2">
      {/* Stepper + actions — sticks under the console header like Ticketbox's */}
      <div className="sticky top-0 z-20 -mx-4 mb-6 border-b border-ink-100 bg-white/95 px-4 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="flex flex-col gap-3 py-3 lg:flex-row lg:items-center">
          <ol className="grid flex-1 grid-cols-2 gap-1 sm:grid-cols-4">
            {STEPS.map((s) => {
              const active = s.n === step;
              return (
                <li key={s.n}>
                  <button
                    type="button"
                    disabled={!canOpen(s.n) || save.isPending}
                    onClick={() => goTo(s.n)}
                    className={`flex w-full items-center gap-2 border-b-2 px-2 py-2 text-left text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                      active ? "border-brand-500 text-ink-900" : "border-transparent text-ink-500 hover:text-ink-800"
                    }`}
                  >
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                        done[s.n] && !active ? "bg-brand-500 text-white" : active ? "bg-brand-500 text-white" : "bg-ink-100 text-ink-500"
                      }`}
                    >
                      {done[s.n] && !active ? <CheckIcon /> : s.n}
                    </span>
                    <span className="truncate">{s.label}</span>
                  </button>
                </li>
              );
            })}
          </ol>
          <div className="flex shrink-0 gap-2">
            <button type="button" className="btn-secondary" disabled={save.isPending} onClick={() => save.mutate(step)}>
              Lưu
            </button>
            <button type="button" className="btn-primary" disabled={save.isPending} onClick={() => save.mutate(step === 4 ? 4 : ((step + 1) as Step))}>
              {save.isPending ? "Đang lưu..." : step === 4 ? "Hoàn tất" : "Tiếp tục"}
            </button>
          </div>
        </div>
        {(error || notice) && (
          <p className={`mb-3 rounded-lg px-3 py-2 text-sm ${error ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-700"}`}>{error ?? notice}</p>
        )}
      </div>

      <div className="mx-auto max-w-5xl space-y-4">
        {step === 1 && (
          <Step1
            form={form}
            set={set}
            asAdmin={asAdmin && !id}
            organizers={organizers}
            categories={categories}
            venueLocked={event?.status === "PUBLISHED"}
          />
        )}
        {step === 2 && <Step2 form={form} set={set} event={event} hasShowtimes={hasShowtimes} />}
        {step === 3 && event && <Step3 form={form} set={set} event={event} policyEditable={policyEditable} />}
        {step === 4 && <Step4 form={form} set={set} />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- building blocks

function Section({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="card p-5 sm:p-6">
      {title && <h3 className="mb-4 text-base font-bold text-ink-800">{title}</h3>}
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Field({ label, required, children, hint }: { label: string; required?: boolean; children: ReactNode; hint?: string }) {
  return (
    <div>
      <label className="label">
        {required && <span className="mr-0.5 text-red-500">*</span>}
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-ink-400">{hint}</p>}
    </div>
  );
}

/** Text input with a "0 / max" counter inside, like Ticketbox's. */
function CountedInput({
  value,
  onChange,
  max,
  placeholder,
  disabled,
  inputMode,
}: {
  value: string;
  onChange: (v: string) => void;
  max: number;
  placeholder?: string;
  disabled?: boolean;
  inputMode?: "numeric";
}) {
  return (
    <div className="relative">
      <input
        value={value}
        maxLength={max}
        disabled={disabled}
        inputMode={inputMode}
        placeholder={placeholder}
        onChange={(e) => onChange(inputMode === "numeric" ? e.target.value.replace(/[^0-9-]/g, "") : e.target.value)}
        className="input pr-16 disabled:bg-ink-50"
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-400">
        {value.length} / {max}
      </span>
    </div>
  );
}

type SetForm = (patch: Partial<WizardForm>) => void;

// ---------------------------------------------------------------- step 1

function Step1({
  form,
  set,
  asAdmin,
  organizers,
  categories,
  venueLocked,
}: {
  form: WizardForm;
  set: SetForm;
  asAdmin: boolean;
  organizers?: Array<{ id: string; fullName: string; email: string }>;
  categories?: Array<{ id: string; name: string }>;
  venueLocked: boolean;
}) {
  const [provinces, setProvinces] = useState<Province[]>([]);
  useEffect(() => {
    void loadProvinces().then(setProvinces);
  }, []);
  const wards = provinces.find((p) => p.n === form.province)?.w ?? [];

  return (
    <>
      {asAdmin && (
        <Section>
          <Field label="Ban tổ chức (đối tác)" required hint="Sự kiện thuộc về đối tác được chọn: doanh thu, hoàn vé, khách tham dự.">
            <select
              value={form.ownerId}
              onChange={(e) => {
                const owner = organizers?.find((o) => o.id === e.target.value);
                set({ ownerId: e.target.value, ...(owner && !form.organizerName ? { organizerName: owner.fullName } : {}) });
              }}
              className="input"
            >
              <option value="">— Chọn đối tác —</option>
              {organizers?.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.fullName} ({o.email})
                </option>
              ))}
            </select>
          </Field>
        </Section>
      )}

      <Section title="Hình ảnh">
        <div className="grid gap-4 sm:grid-cols-[1fr_2fr]">
          <ImageField
            label="Logo ban tổ chức"
            kind="logo"
            value={form.organizerLogoUrl}
            onChange={(url) => set({ organizerLogoUrl: url })}
            hint="Khuyến nghị 275×275."
            previewClassName="h-40 w-full object-contain"
          />
          <ImageField
            label="Ảnh bìa sự kiện"
            kind="banner"
            value={form.bannerUrl}
            onChange={(url) => set({ bannerUrl: url })}
            hint="Khuyến nghị 1280×720 (16:9)."
            previewClassName="aspect-video w-full object-cover"
          />
        </div>
      </Section>

      <Section>
        <Field label="Tên sự kiện" required>
          <CountedInput value={form.title} onChange={(title) => set({ title })} max={100} placeholder="Tên sự kiện" />
        </Field>
      </Section>

      <Section>
        <Field label="Địa chỉ sự kiện" required>
          <div className="inline-flex overflow-hidden rounded-lg ring-1 ring-ink-200">
            {([false, true] as const).map((online) => (
              <button
                key={String(online)}
                type="button"
                disabled={venueLocked}
                onClick={() => set({ isOnline: online })}
                className={`px-4 py-2 text-sm font-semibold transition-colors ${
                  form.isOnline === online ? "bg-brand-500 text-white" : "bg-white text-ink-600 hover:bg-ink-50"
                }`}
              >
                {online ? "Online" : "Offline"}
              </button>
            ))}
          </div>
        </Field>
        {venueLocked && <p className="text-xs text-amber-600">Sự kiện đang mở bán — địa điểm không sửa được ở đây (liên hệ quản trị viên).</p>}

        {form.isOnline ? (
          <>
            <Field label="Nền tảng" hint="Hiển thị công khai, ví dụ: Zoom, Google Meet, YouTube Live.">
              <CountedInput value={form.venueName} onChange={(venueName) => set({ venueName })} max={80} placeholder="Zoom" disabled={venueLocked} />
            </Field>
            <Field label="Link tham gia" required hint="Không hiển thị công khai — chỉ người đã mua vé thấy trên trang vé của họ.">
              <input
                value={form.onlineUrl}
                onChange={(e) => set({ onlineUrl: e.target.value })}
                placeholder="https://..."
                className="input"
              />
            </Field>
          </>
        ) : (
          <>
            <Field label="Tên địa điểm" required>
              <CountedInput value={form.venueName} onChange={(venueName) => set({ venueName })} max={80} placeholder="Tên địa điểm" disabled={venueLocked} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Tỉnh/Thành" required>
                <select
                  value={form.province}
                  disabled={venueLocked}
                  onChange={(e) => set({ province: e.target.value, ward: "" })}
                  className="input"
                >
                  <option value="">Tỉnh/Thành</option>
                  {provinces.map((p) => (
                    <option key={p.n} value={p.n}>
                      {p.n}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Phường/Xã">
                <select value={form.ward} disabled={venueLocked || !form.province} onChange={(e) => set({ ward: e.target.value })} className="input disabled:bg-ink-50">
                  <option value="">Phường/Xã</option>
                  {wards.map((w) => (
                    <option key={w} value={w}>
                      {w}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Số nhà, đường" required>
              <CountedInput value={form.streetAddress} onChange={(streetAddress) => set({ streetAddress })} max={80} placeholder="Số nhà, đường" disabled={venueLocked} />
            </Field>
          </>
        )}
      </Section>

      <Section>
        <Field label="Thể loại sự kiện" required>
          <select value={form.categoryId} onChange={(e) => set({ categoryId: e.target.value })} className="input">
            <option value="">Vui lòng chọn</option>
            {categories?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
      </Section>

      <Section>
        <Field label="Thông tin sự kiện" required>
          <p className="mb-1 text-xs text-ink-400">
            <code>## </code> tiêu đề · <code>- </code> gạch đầu dòng · <code>**chữ đậm**</code> · dòng trống để xuống đoạn
          </p>
          <textarea
            value={form.description}
            onChange={(e) => set({ description: e.target.value })}
            className="input min-h-[220px]"
            placeholder={"## Giới thiệu sự kiện\n\n## Chi tiết sự kiện\n- Chương trình chính:\n- Khách mời:"}
          />
        </Field>
        <GalleryField
          label="Ảnh minh họa"
          kind="content"
          value={form.galleryUrls}
          onChange={(galleryUrls) => set({ galleryUrls })}
          hint="Hiển thị trong phần giới thiệu sự kiện. Rê chuột vào ảnh để đổi thứ tự hoặc xoá."
        />
      </Section>

      <Section title="Thông tin ban tổ chức">
        <Field label="Tên ban tổ chức">
          <CountedInput value={form.organizerName} onChange={(organizerName) => set({ organizerName })} max={120} placeholder="Tên ban tổ chức" />
        </Field>
        <Field label="Thông tin ban tổ chức">
          <textarea value={form.organizerDescription} onChange={(e) => set({ organizerDescription: e.target.value })} className="input min-h-[90px]" />
        </Field>
      </Section>
    </>
  );
}

// ---------------------------------------------------------------- step 2

function Step2({ form, set, event, hasShowtimes }: { form: WizardForm; set: SetForm; event?: EventItem; hasShowtimes: boolean }) {
  return (
    <>
      <Section title="Thời gian">
        {hasShowtimes ? (
          <p className="text-sm text-ink-500">Sự kiện có nhiều suất diễn — thời gian được tính từ lịch các suất bên dưới.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Thời gian bắt đầu" required>
              <input type="datetime-local" value={form.startTime} onChange={(e) => set({ startTime: e.target.value })} className="input" />
            </Field>
            <Field label="Thời gian kết thúc" required>
              <input type="datetime-local" value={form.endTime} onChange={(e) => set({ endTime: e.target.value })} className="input" />
            </Field>
          </div>
        )}
      </Section>

      <Section title="Hình thức bán vé">
        <div className="grid gap-3 sm:grid-cols-2">
          {(["GENERAL", "SEATMAP"] as const).map((mode) => (
            <button
              type="button"
              key={mode}
              disabled={!!event}
              onClick={() => set({ ticketMode: mode })}
              className={`rounded-xl border-2 px-4 py-3 text-left text-sm font-semibold transition-colors disabled:cursor-default ${
                form.ticketMode === mode ? "border-brand-500 bg-brand-50 text-brand-700" : "border-ink-100 text-ink-600"
              } ${event && form.ticketMode !== mode ? "opacity-40" : ""}`}
            >
              {mode === "GENERAL" ? "Vé tự do (General Admission)" : "Sơ đồ chỗ ngồi (Seat Map)"}
              <p className="mt-0.5 text-xs font-normal text-ink-400">{mode === "GENERAL" ? "Bán theo hạng vé & số lượng" : "Khách chọn ghế cụ thể"}</p>
            </button>
          ))}
        </div>
        {event && <p className="text-xs text-ink-400">Hình thức bán vé được chọn khi tạo sự kiện và không đổi được.</p>}
      </Section>

      {!event ? (
        <div className="rounded-xl border border-dashed border-ink-200 px-5 py-6 text-center text-sm text-ink-500">
          Bấm <strong>Lưu</strong> hoặc <strong>Tiếp tục</strong> để tạo bản nháp — sau đó bạn thêm loại vé / sơ đồ ghế ngay tại bước này.
        </div>
      ) : event.ticketMode === "GENERAL" ? (
        <>
          <ShowtimeManager event={event} />
          <TicketTypeManager event={event} />
        </>
      ) : (
        <SeatMapBuilder eventId={event.id} />
      )}
    </>
  );
}

// ---------------------------------------------------------------- step 3

function Step3({ form, set, event, policyEditable }: { form: WizardForm; set: SetForm; event: EventItem; policyEditable: boolean }) {
  return (
    <>
      <Section title="Giới hạn mua vé">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Số vé tối đa / tài khoản" hint="Bỏ trống nếu không giới hạn.">
            <input type="number" min={1} value={form.maxTicketsPerAccount} onChange={(e) => set({ maxTicketsPerAccount: e.target.value })} className="input" />
          </Field>
          <Field label="Độ tuổi tối thiểu" hint="Bỏ trống = mọi lứa tuổi.">
            <input type="number" min={0} max={99} value={form.minAge} onChange={(e) => set({ minAge: e.target.value })} className="input" />
          </Field>
        </div>
      </Section>

      <Section title="Chính sách hoàn vé">
        {policyEditable ? (
          <RefundPolicyEditor value={form.refundPolicy} onChange={(refundPolicy) => set({ refundPolicy })} />
        ) : (
          <p className="text-sm text-ink-500">Chính sách hoàn vé đã khóa vì sự kiện đã gửi duyệt hoặc đang mở bán.</p>
        )}
      </Section>

      <Section title="Điều khoản & lưu ý">
        <textarea value={form.terms} onChange={(e) => set({ terms: e.target.value })} className="input min-h-[120px]" placeholder="Quy định vào cổng, đồ vật bị cấm, ..." />
      </Section>

      <DiscountCodeManager eventId={event.id} />
      {categorySupportsLineup(event.category?.slug) && <ArtistLineupManager eventId={event.id} lineup={event.lineup ?? []} />}
    </>
  );
}

// ---------------------------------------------------------------- step 4

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid items-center gap-1 sm:grid-cols-[180px_1fr] sm:gap-3">
      <label className="text-sm font-semibold text-ink-700 sm:text-right">{label}:</label>
      {children}
    </div>
  );
}

function Step4({ form, set }: { form: WizardForm; set: SetForm }) {
  const company = form.invoiceBusinessType === "COMPANY";
  return (
    <Section>
      <h3 className="text-base font-bold text-ink-800">Thông tin thanh toán</h3>
      <div className="text-sm text-ink-600">
        <p>EventPass sẽ chuyển tiền bán vé đến tài khoản của bạn.</p>
        <p>Tiền bán vé (sau khi trừ phí dịch vụ) sẽ vào tài khoản của bạn sau khi xác nhận báo cáo bán vé từ 7 – 10 ngày.</p>
      </div>
      <div className="space-y-3">
        <Row label="Chủ tài khoản">
          <CountedInput value={form.payoutAccountHolder} onChange={(payoutAccountHolder) => set({ payoutAccountHolder })} max={100} />
        </Row>
        <Row label="Số tài khoản">
          <CountedInput value={form.payoutAccountNumber} onChange={(payoutAccountNumber) => set({ payoutAccountNumber })} max={20} inputMode="numeric" />
        </Row>
        <Row label="Tên ngân hàng">
          <CountedInput value={form.payoutBankName} onChange={(payoutBankName) => set({ payoutBankName })} max={100} placeholder="VD: MB Bank" />
        </Row>
        <Row label="Chi nhánh">
          <CountedInput value={form.payoutBankBranch} onChange={(payoutBankBranch) => set({ payoutBankBranch })} max={100} />
        </Row>
      </div>

      <h3 className="pt-2 text-base font-bold text-ink-800">Hoá đơn đỏ</h3>
      <div className="space-y-3">
        <Row label="Loại hình kinh doanh">
          <select
            value={form.invoiceBusinessType}
            onChange={(e) => set({ invoiceBusinessType: e.target.value as WizardForm["invoiceBusinessType"] })}
            className="input"
          >
            <option value="INDIVIDUAL">Cá nhân</option>
            <option value="COMPANY">Doanh nghiệp</option>
          </select>
        </Row>
        <Row label={company ? "Tên công ty" : "Họ tên"}>
          <CountedInput value={form.invoiceName} onChange={(invoiceName) => set({ invoiceName })} max={100} />
        </Row>
        <Row label="Địa chỉ">
          <CountedInput value={form.invoiceAddress} onChange={(invoiceAddress) => set({ invoiceAddress })} max={100} />
        </Row>
        <Row label="Mã số thuế">
          <CountedInput value={form.invoiceTaxCode} onChange={(invoiceTaxCode) => set({ invoiceTaxCode })} max={14} inputMode="numeric" />
        </Row>
      </div>
      <p className="text-xs text-ink-400">Thông tin này chỉ ban tổ chức và quản trị viên xem được.</p>
    </Section>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5">
      <path d="M4 10.5l4 4 8-9" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
