import { useCallback, useEffect, useMemo, useState } from "react"
import { Loader2, Search } from "lucide-react"
import { toast } from "sonner"
import apiClient from "@food/api/axios"

/*
 * Master > Restaurant GST: for each restaurant, who pays the GST on its food.
 *
 *   Quickdrops pays  -- the restaurant is paid without the GST; Quickdrops
 *                       remits it (and it is in "GST Quickdrops owes" below).
 *   Restaurant pays  -- the GST is paid to the restaurant with its payout and
 *                       it files it. Needs a GSTIN.
 *
 * Applies to orders placed after a change. The restaurant app cannot change
 * it. Below the table, the GST on delivered orders for a date range, split by
 * who owes it, for filing.
 */

const rupees = (n) => `₹${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const apiError = (err, fallback) => err?.response?.data?.message || fallback
const whenLabel = (iso) => {
  if (!iso) return ""
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })
}
const dayInput = (d) => {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 10)
}

function Choice({ value, decided, hasGstin, busy, onChoose }) {
  const options = [
    { key: "platform", label: "Quickdrops pays" },
    { key: "restaurant", label: "Restaurant pays" },
  ]
  return (
    <div className="inline-flex overflow-hidden rounded-lg border border-neutral-300" role="radiogroup">
      {options.map((o) => {
        const on = value === o.key
        const blocked = o.key === "restaurant" && !hasGstin && !on
        return (
          <button
            key={o.key}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={blocked || busy}
            title={blocked ? "Add the restaurant's GSTIN first (GSTIN column)" : undefined}
            onClick={() => (!on || !decided) && onChoose(o.key)}
            className={`px-3 py-1.5 text-xs font-medium disabled:cursor-not-allowed ${
              on ? "bg-neutral-900 text-white" : "bg-white text-neutral-700 hover:bg-neutral-100"
            } ${blocked ? "opacity-40" : ""}`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/*
 * The restaurant's GST number, editable here: "Restaurant pays" needs one,
 * and most restaurants had none saved, so the choice could not be made on this
 * page at all. Saving a GSTIN also marks the restaurant GST registered.
 */
const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/

function GstinCell({ row, onSaved }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(row.gstNumber || "")
  const [saving, setSaving] = useState(false)
  const clean = value.trim().toUpperCase().replace(/\s+/g, "")
  const valid = clean === "" || GSTIN_PATTERN.test(clean)

  const save = async () => {
    if (!valid) return
    setSaving(true)
    try {
      const res = await apiClient.put(
        `/food/admin/gst-payout/restaurants/${row.restaurantId}/gstin`,
        { gstin: clean },
        { contextModule: "admin" },
      )
      onSaved(res?.data?.data)
      setEditing(false)
      toast.success(clean ? `GSTIN saved for ${row.restaurantName}` : `GSTIN removed for ${row.restaurantName}`)
    } catch (err) {
      toast.error(apiError(err, "Could not save the GSTIN"))
    } finally {
      setSaving(false)
    }
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-2">
        {row.gstNumber ? (
          <span className="font-mono text-xs text-neutral-700">{row.gstNumber}</span>
        ) : (
          <span className="text-xs text-neutral-400">none saved</span>
        )}
        <button
          type="button"
          onClick={() => {
            setValue(row.gstNumber || "")
            setEditing(true)
          }}
          className="rounded border border-neutral-300 px-2 py-0.5 text-[11px] font-medium text-neutral-700 hover:bg-neutral-100"
        >
          {row.gstNumber ? "Edit" : "Add GSTIN"}
        </button>
      </div>
    )
  }
  return (
    <form
      className="flex flex-col gap-1"
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
    >
      <div className="flex items-center gap-1.5">
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="02ABCDE1234F1Z5"
          maxLength={20}
          className={`w-40 rounded-lg border px-2 py-1 font-mono text-xs uppercase ${valid ? "border-neutral-300" : "border-red-400"}`}
        />
        <button
          type="submit"
          disabled={!valid || saving}
          className="rounded-lg bg-neutral-900 px-2 py-1 text-[11px] font-medium text-white disabled:opacity-40"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={() => setEditing(false)} className="px-1 text-[11px] text-neutral-500">
          Cancel
        </button>
      </div>
      {!valid && <span className="text-[11px] text-red-600">15 characters, like 02ABCDE1234F1Z5</span>}
    </form>
  )
}

function GstTotals() {
  const today = new Date()
  const [from, setFrom] = useState(dayInput(new Date(today.getFullYear(), today.getMonth(), 1)))
  const [to, setTo] = useState(dayInput(today))
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiClient.get("/food/admin/gst-payout/totals", {
        params: { from: new Date(`${from}T00:00:00`).toISOString(), to: new Date(`${to}T23:59:59`).toISOString() },
        contextModule: "admin",
      })
      setData(res?.data?.data || null)
    } catch (err) {
      toast.error(apiError(err, "Could not load GST totals"))
    } finally {
      setLoading(false)
    }
  }, [from, to])

  useEffect(() => {
    load()
  }, [load])

  const t = data?.total
  return (
    <div className="rounded-lg border border-neutral-200 bg-white">
      <div className="flex flex-wrap items-end gap-3 border-b border-neutral-100 p-3">
        <div>
          <h2 className="text-sm font-semibold text-neutral-900">GST for filing</h2>
          <p className="text-xs text-neutral-500">GST on the food of delivered orders placed in these dates.</p>
        </div>
        <label className="ml-auto flex flex-col text-xs text-neutral-600">
          From
          <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="rounded-lg border border-neutral-300 px-2 py-1 text-sm" />
        </label>
        <label className="flex flex-col text-xs text-neutral-600">
          To
          <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="rounded-lg border border-neutral-300 px-2 py-1 text-sm" />
        </label>
      </div>
      {loading && !t ? (
        <div className="p-6 text-center text-neutral-500">
          <Loader2 className="mx-auto h-5 w-5 animate-spin" />
        </div>
      ) : t ? (
        <>
          <dl className="grid grid-cols-2 gap-px bg-neutral-100 sm:grid-cols-4">
            {[
              ["Delivered orders", String(t.orders)],
              ["GST on food", rupees(t.gstOnFood)],
              ["GST Quickdrops owes", rupees(t.owedByPlatform)],
              ["GST paid to restaurants", rupees(t.paidToRestaurants)],
            ].map(([label, value]) => (
              <div key={label} className="bg-white px-4 py-3">
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{label}</dt>
                <dd className="mt-1 text-lg font-semibold tabular-nums text-neutral-900">{value}</dd>
              </div>
            ))}
          </dl>
          {data.restaurants.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 text-left text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                  <tr>
                    <th className="px-4 py-2">Restaurant</th>
                    <th className="px-4 py-2 text-right">Orders</th>
                    <th className="px-4 py-2 text-right">GST on food</th>
                    <th className="px-4 py-2 text-right">Quickdrops owes</th>
                    <th className="px-4 py-2 text-right">Paid to restaurant</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 tabular-nums">
                  {data.restaurants.map((r) => (
                    <tr key={r.restaurantId}>
                      <td className="px-4 py-2 text-neutral-900">{r.restaurantName || "Unnamed"}</td>
                      <td className="px-4 py-2 text-right">{r.orders}</td>
                      <td className="px-4 py-2 text-right">{rupees(r.gstOnFood)}</td>
                      <td className="px-4 py-2 text-right">{rupees(r.owedByPlatform)}</td>
                      <td className="px-4 py-2 text-right">{rupees(r.paidToRestaurant)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : null}
    </div>
  )
}

export default function MasterRestaurantGst() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState("")
  const [q, setQ] = useState("")

  const load = useCallback(async () => {
    try {
      const res = await apiClient.get("/food/admin/gst-payout/restaurants", { contextModule: "admin" })
      setRows(res?.data?.data?.restaurants || [])
    } catch (err) {
      toast.error(apiError(err, "Could not load restaurants"))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return needle ? rows.filter((r) => `${r.restaurantName} ${r.gstNumber}`.toLowerCase().includes(needle)) : rows
  }, [rows, q])

  const counts = useMemo(
    () => ({
      restaurant: rows.filter((r) => r.gstPayout === "restaurant").length,
      platform: rows.filter((r) => r.gstPayout !== "restaurant").length,
    }),
    [rows],
  )

  const choose = async (r, gstPayout) => {
    setSavingId(r.restaurantId)
    try {
      const res = await apiClient.put(`/food/admin/gst-payout/restaurants/${r.restaurantId}`, { gstPayout }, { contextModule: "admin" })
      const saved = res?.data?.data
      setRows((list) => list.map((x) => (x.restaurantId === r.restaurantId ? { ...x, ...saved } : x)))
      toast.success(
        gstPayout === "restaurant"
          ? `${r.restaurantName}: GST paid to the restaurant on new orders`
          : `${r.restaurantName}: Quickdrops pays the GST on new orders`,
      )
    } catch (err) {
      toast.error(apiError(err, "Could not save"))
    } finally {
      setSavingId("")
    }
  }

  return (
    <div className="min-h-screen bg-neutral-50 p-4 sm:p-6">
      <div className="mx-auto max-w-5xl space-y-4">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">Restaurant GST</h1>
          <p className="max-w-2xl text-sm text-neutral-500">
            Who pays the GST on each restaurant&apos;s food. <b className="font-medium text-neutral-700">Quickdrops pays</b>: the
            restaurant is paid without it and Quickdrops pays it to the government.{" "}
            <b className="font-medium text-neutral-700">Restaurant pays</b>: it is paid to the restaurant with its payout and it
            files it. Changes apply to orders placed from then on; the restaurant cannot change this.
          </p>
        </div>

        <div className="rounded-lg border border-neutral-200 bg-white">
          <div className="flex flex-wrap items-center gap-3 border-b border-neutral-100 p-3 text-sm text-neutral-600">
            <span>
              {counts.platform} Quickdrops pays · {counts.restaurant} restaurant pays
            </span>
            <div className="relative ml-auto w-full sm:w-64">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-neutral-400" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Restaurant or GSTIN"
                className="w-full rounded-lg border border-neutral-300 py-2 pl-8 pr-3 text-sm"
              />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-left text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="px-4 py-2.5">Restaurant</th>
                  <th className="px-4 py-2.5">GSTIN</th>
                  <th className="px-4 py-2.5">Who pays the GST</th>
                  <th className="px-4 py-2.5">Last changed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {loading ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-12 text-center text-neutral-500">
                      <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                    </td>
                  </tr>
                ) : shown.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-12 text-center text-neutral-500">
                      No restaurant matches this search.
                    </td>
                  </tr>
                ) : (
                  shown.map((r) => (
                    <tr key={r.restaurantId}>
                      <td className="px-4 py-2.5">
                        <div className="font-medium text-neutral-900">{r.restaurantName || "Unnamed"}</div>
                        {r.status && <div className="text-xs capitalize text-neutral-500">{r.status}</div>}
                      </td>
                      <td className="px-4 py-2.5">
                        <GstinCell
                          row={r}
                          onSaved={(saved) =>
                            setRows((list) => list.map((x) => (x.restaurantId === r.restaurantId ? { ...x, ...saved } : x)))
                          }
                        />
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <Choice
                            value={r.gstPayout}
                            decided={r.decided}
                            hasGstin={Boolean(r.gstNumber)}
                            busy={savingId === r.restaurantId}
                            onChoose={(key) => choose(r, key)}
                          />
                          {savingId === r.restaurantId && <Loader2 className="h-4 w-4 animate-spin text-neutral-400" />}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-neutral-500">
                        {r.decided
                          ? r.updatedAt
                            ? `${r.updatedBy || "admin"} · ${whenLabel(r.updatedAt)}`
                            : "—"
                          : <span className="text-amber-700">Not set yet: follows &ldquo;GST registered&rdquo;. Click a choice to set it.</span>}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <GstTotals />
      </div>
    </div>
  )
}
