import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import apiClient from "@food/api/axios"

/*
 * Who pays the GST on this restaurant's food -- the admin's decision, saved
 * straight away (not with the documents). Same setting as Master > Restaurant
 * GST; the restaurant app cannot change it. Applies to orders placed after.
 */
const OPTIONS = [
  {
    key: "platform",
    label: "Quickdrops pays",
    detail: "Restaurant is paid without the GST on its food (Rs 100 incl. 5% at 10% commission pays Rs 85.72). Quickdrops pays that GST to the government.",
  },
  {
    key: "restaurant",
    label: "Restaurant pays",
    detail: "The GST is paid to the restaurant with each payout (Rs 100 incl. 5% at 10% commission pays Rs 90.48) and it files it. Needs a GSTIN.",
  },
]

export default function GstPayoutControl({ restaurantId, value, hasGstin, onChanged }) {
  const [current, setCurrent] = useState(value === "restaurant" ? "restaurant" : "platform")
  const [saving, setSaving] = useState("")

  useEffect(() => {
    setCurrent(value === "restaurant" ? "restaurant" : "platform")
  }, [value])

  const choose = async (key) => {
    if (key === current || saving) return
    setSaving(key)
    try {
      const res = await apiClient.put(`/food/admin/gst-payout/restaurants/${restaurantId}`, { gstPayout: key }, { contextModule: "admin" })
      const saved = res?.data?.data
      setCurrent(saved?.gstPayout || key)
      onChanged?.(saved)
      toast.success(key === "restaurant" ? "GST will be paid to the restaurant on new orders" : "Quickdrops will pay the GST on new orders")
    } catch (err) {
      toast.error(err?.response?.data?.message || "Could not save who pays the GST")
    } finally {
      setSaving("")
    }
  }

  return (
    <div className="mb-4 rounded-lg border border-slate-200 p-3">
      <div className="mb-2 text-sm font-medium text-slate-800">Who pays the GST on this restaurant&apos;s food?</div>
      <div className="flex flex-wrap gap-2">
        {OPTIONS.map((o) => {
          const on = current === o.key
          const blocked = o.key === "restaurant" && !hasGstin && !on
          return (
            <button
              key={o.key}
              type="button"
              onClick={() => choose(o.key)}
              disabled={blocked || Boolean(saving)}
              title={blocked ? "Add the GST number first" : undefined}
              className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1 text-sm disabled:opacity-50 ${
                on ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 text-slate-700"
              }`}
            >
              {saving === o.key && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {o.label}
            </button>
          )
        })}
      </div>
      <p className="mt-2 text-xs text-slate-500">
        {OPTIONS.find((o) => o.key === current)?.detail} Applies to orders placed from now on.
        {!hasGstin && current !== "restaurant" ? " Add a GST number below to allow “Restaurant pays”." : ""}
      </p>
    </div>
  )
}
