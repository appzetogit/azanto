import { useCallback, useEffect, useMemo, useState } from "react"
import { appServicesAPI } from "@food/api"
import { Switch } from "@food/components/ui/switch"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@food/components/ui/card"
import { toast } from "sonner"
import { Loader2, MapPin, Search, AlertTriangle } from "lucide-react"

/**
 * Which services the customer app shows, everywhere or zone by zone.
 *
 * One switch per service for the whole platform, and one per zone beneath it.
 * "Off everywhere" wins over any zone, so a zone switch is greyed out while its
 * service is off -- showing it as live would invite someone to flip it and
 * wonder why nothing changed.
 *
 * Lives under /admin/master like Platform Settings: it covers every vertical,
 * so it is one screen, not one per panel.
 */

const whenLabel = (iso) => {
  if (!iso) return ""
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })
}

/**
 * The reasons an admin picks when switching a service off. Shown to the
 * customer, verbatim, when they tap the greyed-out module in the app — so each
 * reads as the full, polite message a customer should see. Deliberately only
 * these two options (no free-text), per the business rule.
 */
const OFF_REASONS = [
  "Sorry, we're not serving at the moment. Please try again in some time — due to weather conditions.",
  "Sorry, we're not serving at the moment. Please try again in some time — due to non-availability of a delivery partner.",
]

function ServiceCard({ service, busyKey, onToggleService, onToggleZone }) {
  const [query, setQuery] = useState("")
  const zones = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? service.zones.filter((z) => z.name.toLowerCase().includes(q)) : service.zones
  }, [service.zones, query])

  const hiddenZones = service.zones.filter((z) => !z.enabled).length
  const serviceBusy = busyKey === service.key

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <CardTitle className="text-base">{service.label}</CardTitle>
            <CardDescription>
              {service.enabled
                ? hiddenZones > 0
                  ? `Shown in the app, except in ${hiddenZones} zone${hiddenZones === 1 ? "" : "s"}.`
                  : "Shown in the app everywhere."
                : "Hidden from the app everywhere."}
              {service.updatedAt && ` Last changed ${whenLabel(service.updatedAt)}.`}
            </CardDescription>
            {!service.enabled && service.reason && (
              <p className="mt-1 text-xs font-medium text-amber-700">
                Reason shown to customers: “{service.reason}”
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {serviceBusy && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            <span className={`text-sm font-medium ${service.enabled ? "text-emerald-700" : "text-muted-foreground"}`}>
              {service.enabled ? "On" : "Off"}
            </span>
            <Switch
              checked={service.enabled}
              disabled={serviceBusy}
              onCheckedChange={(checked) => onToggleService(service, checked)}
              aria-label={`Show ${service.label} in the app`}
            />
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {service.zonesError && (
          <p className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {service.zonesError}
          </p>
        )}

        {service.zones.length > 6 && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${service.label} zones`}
              className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm"
            />
          </div>
        )}

        {service.zones.length === 0 && !service.zonesError && (
          <p className="text-sm text-muted-foreground">
            No {service.label} zones drawn yet. The switch above still applies everywhere.
          </p>
        )}

        {zones.length > 0 && (
          <ul className="divide-y rounded-md border">
            {zones.map((zone) => {
              const zoneKey = `${service.key}:${zone.id}`
              const busy = busyKey === zoneKey
              return (
                <li
                  key={zone.id}
                  className={`flex items-center gap-3 px-3 py-2.5 ${service.enabled ? "" : "opacity-60"}`}
                >
                  <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{zone.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {!zone.zoneActive && "Zone is inactive in zone setup · "}
                      {zone.enabled ? "Shown here" : "Hidden here"}
                      {zone.updatedAt && ` · changed ${whenLabel(zone.updatedAt)}`}
                    </div>
                    {!zone.enabled && zone.reason && (
                      <div className="truncate text-xs font-medium text-amber-700">
                        Reason: “{zone.reason}”
                      </div>
                    )}
                  </div>
                  {busy && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                  <Switch
                    checked={zone.enabled}
                    disabled={busy || !service.enabled}
                    onCheckedChange={(checked) => onToggleZone(service, zone, checked)}
                    aria-label={`Show ${service.label} in ${zone.name}`}
                  />
                </li>
              )
            })}
          </ul>
        )}
        {service.zones.length > 0 && zones.length === 0 && (
          <p className="text-sm text-muted-foreground">No zones match that search.</p>
        )}
      </CardContent>
    </Card>
  )
}

export default function AppServices() {
  const [services, setServices] = useState([])
  const [loading, setLoading] = useState(true)
  const [busyKey, setBusyKey] = useState("")
  // The off-switch the admin just flipped, held open until they pick a reason.
  // { kind: 'service'|'zone', service, zone? }
  const [offTarget, setOffTarget] = useState(null)
  const [pickedReason, setPickedReason] = useState(OFF_REASONS[0])
  const [customReason, setCustomReason] = useState("")
  const [savingOff, setSavingOff] = useState(false)

  const apply = (res) => {
    const list = res?.data?.data?.services || res?.data?.services || []
    setServices(Array.isArray(list) ? list : [])
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      apply(await appServicesAPI.getAdminView())
    } catch (error) {
      toast.error(error?.response?.data?.message || "Could not load app services.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const toggleService = async (service, enabled, reason = "") => {
    setBusyKey(service.key)
    try {
      apply(await appServicesAPI.setService(service.key, enabled, reason))
      toast.success(`${service.label} is now ${enabled ? "shown" : "hidden"} in the app everywhere.`)
    } catch (error) {
      toast.error(error?.response?.data?.message || `Could not change ${service.label}.`)
    } finally {
      setBusyKey("")
    }
  }

  const toggleZone = async (service, zone, enabled, reason = "") => {
    setBusyKey(`${service.key}:${zone.id}`)
    try {
      apply(await appServicesAPI.setZone(service.key, zone.id, enabled, reason))
      toast.success(`${service.label} is now ${enabled ? "shown" : "hidden"} in ${zone.name}.`)
    } catch (error) {
      toast.error(error?.response?.data?.message || `Could not change ${service.label} in ${zone.name}.`)
    } finally {
      setBusyKey("")
    }
  }

  // Turning something ON needs no reason, so it goes straight through. Turning
  // it OFF opens the reason picker first — the switch does not actually flip
  // until a reason is chosen, which is what the customer will be shown.
  const requestToggleService = (service, enabled) => {
    if (enabled) return toggleService(service, true, "")
    setPickedReason(OFF_REASONS[0])
    setCustomReason("")
    setOffTarget({ kind: "service", service })
  }

  const requestToggleZone = (service, zone, enabled) => {
    if (enabled) return toggleZone(service, zone, true, "")
    setPickedReason(OFF_REASONS[0])
    setCustomReason("")
    setOffTarget({ kind: "zone", service, zone })
  }

  const confirmOff = async () => {
    if (!offTarget) return
    const reason = (pickedReason === "Other" ? customReason : pickedReason).trim()
    if (!reason) {
      toast.error("Please choose or type a reason.")
      return
    }
    setSavingOff(true)
    try {
      if (offTarget.kind === "service") {
        await toggleService(offTarget.service, false, reason)
      } else {
        await toggleZone(offTarget.service, offTarget.zone, false, reason)
      }
      setOffTarget(null)
    } finally {
      setSavingOff(false)
    }
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold">App services</h1>
        <p className="text-muted-foreground max-w-3xl">
          Choose which services customers see in the app. Turn a service off everywhere, or only in some zones.
          Customers in a zone where a service is off do not see its tab. Each service uses its own zones from its
          zone setup. Changes reach the app within about a minute.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading services
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {services.map((service) => (
            <ServiceCard
              key={service.key}
              service={service}
              busyKey={busyKey}
              onToggleService={requestToggleService}
              onToggleZone={requestToggleZone}
            />
          ))}
        </div>
      )}

      {offTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => (savingOff ? null : setOffTarget(null))}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-slate-900">
              Why are you turning this off?
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              {offTarget.kind === "service"
                ? `${offTarget.service.label} will be switched off everywhere.`
                : `${offTarget.service.label} will be switched off in ${offTarget.zone.name}.`}{" "}
              The customer sees this reason when they tap the greyed-out module.
            </p>

            <div className="mt-4 space-y-2">
              {OFF_REASONS.map((r) => (
                <label
                  key={r}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm ${
                    pickedReason === r
                      ? "border-orange-500 bg-orange-50 text-slate-900"
                      : "border-slate-200 text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <input
                    type="radio"
                    name="off-reason"
                    className="accent-orange-500"
                    checked={pickedReason === r}
                    onChange={() => setPickedReason(r)}
                  />
                  {r}
                </label>
              ))}
            </div>

            {pickedReason === "Other" && (
              <input
                type="text"
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                placeholder="Type the reason the customer should see…"
                maxLength={200}
                autoFocus
                className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={savingOff}
                onClick={() => setOffTarget(null)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={savingOff}
                onClick={confirmOff}
                className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
              >
                {savingOff && <Loader2 className="h-4 w-4 animate-spin" />}
                Turn off
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
