import { useState, useEffect, useMemo } from "react"
import { ChevronDown, FileText, FileSpreadsheet, Loader2, Search, RotateCcw, ShoppingBag, IndianRupee } from "lucide-react"
import TablePagination, { usePagination, SCROLL_TABLE_CLASS, STICKY_THEAD_CLASS } from "@food/components/admin/TablePagination"
import { adminAPI } from "@food/api"
import { toast } from "sonner"

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

// Money columns shared by the date-wise table, the month-wise summary and the bottom totals.
const MONEY_COLUMNS = [
  { key: "totalBillAmount", label: "Total Bill Amount (₹)", totalLabel: "Total Bill Amount" },
  { key: "itemTotal", label: "Item Total (₹)", totalLabel: "Total Item Amount" },
  { key: "itemGst", label: "Item GST (₹)", totalLabel: "Total Item GST" },
  { key: "platformFee", label: "Platform Fee (₹)", totalLabel: "Total Platform Fee" },
  { key: "platformFeeGst", label: "Platform Fee GST (₹)", totalLabel: "Total Platform Fee GST" },
  { key: "deliveryCharges", label: "Delivery Charges (₹)", totalLabel: "Total Delivery Charges" },
  { key: "discount", label: "Discount (₹)", totalLabel: "Total Discount" },
  { key: "adminCommission", label: "Admin Commission (₹)", totalLabel: "Total Admin Commission" },
]

const formatINR = (value) =>
  `₹${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const plain = (value) => Number(Number(value || 0).toFixed(2))

const defaultFilters = () => {
  const now = new Date()
  return {
    restaurantId: "all",
    fromDate: "",
    toDate: "",
    month: String(now.getMonth() + 1),
    year: String(now.getFullYear()),
  }
}

const EMPTY_SUMMARY = { totalOrders: 0, ...Object.fromEntries(MONEY_COLUMNS.map((c) => [c.key, 0])) }

const selectClass =
  "w-full px-4 py-2.5 pr-8 text-sm rounded-lg border border-slate-300 bg-white text-slate-700 appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500"
const inputClass =
  "w-full px-4 py-2.5 text-sm rounded-lg border border-slate-300 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
const thClass = "px-4 py-3 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider whitespace-nowrap"
const thRight = "px-4 py-3 text-right text-[10px] font-bold text-slate-700 uppercase tracking-wider whitespace-nowrap"
const tdClass = "px-4 py-3 whitespace-nowrap text-sm text-slate-700"
const tdRight = "px-4 py-3 whitespace-nowrap text-sm text-right text-slate-900"

export default function FoodSaleReport() {
  const [filters, setFilters] = useState(defaultFilters)
  const [restaurants, setRestaurants] = useState([])
  const [rows, setRows] = useState([])
  const [monthWise, setMonthWise] = useState([])
  const [monthWiseCombined, setMonthWiseCombined] = useState([])
  const [summary, setSummary] = useState(EMPTY_SUMMARY)
  const [loading, setLoading] = useState(true)
  const [restaurantWiseBreakdown, setRestaurantWiseBreakdown] = useState(false)
  // Filters the current result was fetched with, so exports describe what is on screen.
  const [appliedFilters, setAppliedFilters] = useState(defaultFilters)

  const pagination = usePagination(rows, { storageKey: "food-sale-report", resetOn: [rows] })

  const years = useMemo(() => {
    const current = new Date().getFullYear()
    return Array.from({ length: current - 2022 + 1 }, (_, i) => String(current - i))
  }, [])

  useEffect(() => {
    const fetchRestaurants = async () => {
      try {
        const response = await adminAPI.getRestaurants({ limit: 1000 })
        if (response?.data?.success && response.data.data?.restaurants) {
          setRestaurants(response.data.data.restaurants)
        }
      } catch {
        // The dropdown just stays on "All Restaurant".
      }
    }
    fetchRestaurants()
  }, [])

  const fetchReport = async (activeFilters) => {
    if (activeFilters.fromDate && activeFilters.toDate && activeFilters.fromDate > activeFilters.toDate) {
      toast.error("From Date must be on or before To Date")
      return
    }
    try {
      setLoading(true)
      const params = {
        restaurantId: activeFilters.restaurantId !== "all" ? activeFilters.restaurantId : undefined,
        fromDate: activeFilters.fromDate || undefined,
        toDate: activeFilters.toDate || undefined,
        year: activeFilters.year || undefined,
        month: activeFilters.year && activeFilters.month ? activeFilters.month : undefined,
      }
      const response = await adminAPI.getFoodSaleReport(params)
      const data = response?.data?.data
      if (response?.data?.success && data) {
        setRows(data.rows || [])
        setMonthWise(data.monthWise || [])
        setMonthWiseCombined(data.monthWiseCombined || [])
        setSummary(data.summary || EMPTY_SUMMARY)
        setAppliedFilters(activeFilters)
      } else {
        toast.error(response?.data?.message || "Failed to fetch food sale report")
      }
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to fetch food sale report")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchReport(filters)
    // Only on mount; afterwards the Search button applies filters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSearch = () => fetchReport(filters)

  const handleReset = () => {
    const defaults = defaultFilters()
    setFilters(defaults)
    setRestaurantWiseBreakdown(false)
    fetchReport(defaults)
  }

  const setFilter = (key, value) => setFilters((prev) => ({ ...prev, [key]: value }))

  const isAllRestaurants = appliedFilters.restaurantId === "all"
  const monthRows = isAllRestaurants && !restaurantWiseBreakdown ? monthWiseCombined : monthWise

  const restaurantLabel = isAllRestaurants
    ? "All Restaurant"
    : restaurants.find((r) => String(r._id || r.id) === appliedFilters.restaurantId)?.restaurantName ||
      rows[0]?.restaurantName ||
      "Selected Restaurant"

  const periodLabel = () => {
    const parts = []
    if (appliedFilters.year) {
      parts.push(appliedFilters.month ? `${MONTHS[Number(appliedFilters.month) - 1]} ${appliedFilters.year}` : `Year ${appliedFilters.year}`)
    }
    if (appliedFilters.fromDate || appliedFilters.toDate) {
      parts.push(`${appliedFilters.fromDate || "…"} to ${appliedFilters.toDate || "…"}`)
    }
    return parts.length ? parts.join(", ") : "All Time"
  }

  const exportFilename = () => `food_sale_report_${new Date().toISOString().split("T")[0]}`

  const dateWiseSheetRows = () =>
    rows.map((r) => [r.sNo, r.date, r.orderId, r.restaurantName, ...MONEY_COLUMNS.map((c) => plain(r[c.key]))])
  const monthWiseSheetRows = () =>
    monthRows.map((m) => [m.month, m.year, m.restaurantName, m.totalOrders, ...MONEY_COLUMNS.map((c) => plain(m[c.key]))])
  const summarySheetRows = () => [
    ["Total Orders", summary.totalOrders],
    ...MONEY_COLUMNS.map((c) => [c.totalLabel, plain(summary[c.key])]),
  ]

  const handleExportExcel = async () => {
    if (rows.length === 0) {
      toast.error("No data to export")
      return
    }
    try {
      const XLSX = await import("xlsx")
      const header = [
        ["Food Sale Report"],
        [`Restaurant: ${restaurantLabel}`],
        [`Period: ${periodLabel()}`],
        [],
      ]
      const wb = XLSX.utils.book_new()
      const dateWise = XLSX.utils.aoa_to_sheet([
        ...header,
        ["S.No.", "Date", "Order ID", "Restaurant Name", ...MONEY_COLUMNS.map((c) => c.label)],
        ...dateWiseSheetRows(),
        [],
        ["", "", "", "Total", ...MONEY_COLUMNS.map((c) => plain(summary[c.key]))],
      ])
      const monthSheet = XLSX.utils.aoa_to_sheet([
        ...header,
        ["Month", "Year", "Restaurant Name", "Total Orders", ...MONEY_COLUMNS.map((c) => c.label)],
        ...monthWiseSheetRows(),
      ])
      const summarySheet = XLSX.utils.aoa_to_sheet([...header, ["Metric", "Value"], ...summarySheetRows()])
      dateWise["!cols"] = [{ wch: 6 }, { wch: 12 }, { wch: 16 }, { wch: 28 }, ...MONEY_COLUMNS.map(() => ({ wch: 18 }))]
      monthSheet["!cols"] = [{ wch: 12 }, { wch: 8 }, { wch: 28 }, { wch: 12 }, ...MONEY_COLUMNS.map(() => ({ wch: 18 }))]
      summarySheet["!cols"] = [{ wch: 28 }, { wch: 18 }]
      XLSX.utils.book_append_sheet(wb, dateWise, "Date-wise Report")
      XLSX.utils.book_append_sheet(wb, monthSheet, "Month-wise Summary")
      XLSX.utils.book_append_sheet(wb, summarySheet, "Summary")
      XLSX.writeFile(wb, `${exportFilename()}.xlsx`)
    } catch {
      toast.error("Failed to export Excel")
    }
  }

  const handleExportPDF = async () => {
    if (rows.length === 0) {
      toast.error("No data to export")
      return
    }
    try {
      const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")])
      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" })
      // jsPDF's built-in fonts have no ₹ glyph, so amounts are printed as Rs.
      const money = (v) => Number(v || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      const moneyHeads = MONEY_COLUMNS.map((c) => c.label.replace(" (₹)", " (Rs.)"))
      const tableStyle = {
        styles: { fontSize: 7, cellPadding: 1.5 },
        headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: "bold" },
        margin: { left: 10, right: 10 },
      }

      doc.setFontSize(16)
      doc.text("Quickdrops India – Food Sale Report", 10, 14)
      doc.setFontSize(9)
      doc.text(`Restaurant: ${restaurantLabel}    Period: ${periodLabel()}    Generated: ${new Date().toLocaleString("en-IN")}`, 10, 20)

      autoTable(doc, {
        ...tableStyle,
        startY: 25,
        head: [["S.No.", "Date", "Order ID", "Restaurant Name", ...moneyHeads]],
        body: rows.map((r) => [r.sNo, r.date, r.orderId, r.restaurantName, ...MONEY_COLUMNS.map((c) => money(r[c.key]))]),
        foot: [["", "", "", "Total", ...MONEY_COLUMNS.map((c) => money(summary[c.key]))]],
        footStyles: { fillColor: [241, 245, 249], textColor: 20, fontStyle: "bold" },
      })

      doc.setFontSize(12)
      let y = doc.lastAutoTable.finalY + 10
      if (y > 180) { doc.addPage(); y = 14 }
      doc.text("Month-wise Summary", 10, y)
      autoTable(doc, {
        ...tableStyle,
        startY: y + 3,
        head: [["Month", "Year", "Restaurant Name", "Total Orders", ...moneyHeads]],
        body: monthRows.map((m) => [m.month, m.year, m.restaurantName, m.totalOrders, ...MONEY_COLUMNS.map((c) => money(m[c.key]))]),
      })

      y = doc.lastAutoTable.finalY + 10
      if (y > 150) { doc.addPage(); y = 14 }
      doc.text("Summary", 10, y)
      autoTable(doc, {
        ...tableStyle,
        startY: y + 3,
        tableWidth: 110,
        head: [["Metric", "Value"]],
        body: [
          ["Total Orders", String(summary.totalOrders)],
          ...MONEY_COLUMNS.map((c) => [c.totalLabel, `Rs. ${money(summary[c.key])}`]),
        ],
      })

      doc.save(`${exportFilename()}.pdf`)
    } catch {
      toast.error("Failed to export PDF")
    }
  }

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen overflow-x-hidden">
      <div className="w-full max-w-full">
        {/* Page Header */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Food Sale Report</h1>
            <p className="text-sm text-slate-500 mt-1">Delivered orders · {restaurantLabel} · {periodLabel()}</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleExportExcel}
              disabled={loading || rows.length === 0}
              className="px-4 py-2.5 text-sm font-medium rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FileSpreadsheet className="w-4 h-4 text-green-600" />
              Export Excel
            </button>
            <button
              onClick={handleExportPDF}
              disabled={loading || rows.length === 0}
              className="px-4 py-2.5 text-sm font-medium rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FileText className="w-4 h-4 text-red-600" />
              Export PDF
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
            <div className="relative">
              <label className="block text-sm font-semibold text-slate-700 mb-2">Restaurant</label>
              <select value={filters.restaurantId} onChange={(e) => setFilter("restaurantId", e.target.value)} className={selectClass}>
                <option value="all">All Restaurant</option>
                {restaurants.map((r) => (
                  <option key={r._id || r.id} value={String(r._id || r.id)}>
                    {r.restaurantName || r.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 bottom-2.5 w-4 h-4 text-slate-500 pointer-events-none" />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">From Date</label>
              <input type="date" value={filters.fromDate} max={filters.toDate || undefined} onChange={(e) => setFilter("fromDate", e.target.value)} className={inputClass} />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">To Date</label>
              <input type="date" value={filters.toDate} min={filters.fromDate || undefined} onChange={(e) => setFilter("toDate", e.target.value)} className={inputClass} />
            </div>

            <div className="relative">
              <label className="block text-sm font-semibold text-slate-700 mb-2">Month</label>
              <select value={filters.month} onChange={(e) => setFilter("month", e.target.value)} disabled={!filters.year} className={`${selectClass} disabled:bg-slate-100 disabled:cursor-not-allowed`}>
                <option value="">All Months</option>
                {MONTHS.map((m, i) => (
                  <option key={m} value={String(i + 1)}>{m}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 bottom-2.5 w-4 h-4 text-slate-500 pointer-events-none" />
            </div>

            <div className="relative">
              <label className="block text-sm font-semibold text-slate-700 mb-2">Year</label>
              <select
                value={filters.year}
                onChange={(e) => setFilters((prev) => ({ ...prev, year: e.target.value, month: e.target.value ? prev.month : "" }))}
                className={selectClass}
              >
                <option value="">All Years</option>
                {years.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 bottom-2.5 w-4 h-4 text-slate-500 pointer-events-none" />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3">
            <button
              onClick={handleReset}
              disabled={loading}
              className="px-6 py-2.5 text-sm font-medium rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-all flex items-center gap-2 disabled:opacity-50"
            >
              <RotateCcw className="w-4 h-4" />
              Reset
            </button>
            <button
              onClick={handleSearch}
              disabled={loading}
              className="px-6 py-2.5 text-sm font-medium rounded-lg bg-blue-500 text-white hover:bg-blue-600 transition-all flex items-center gap-2 disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              Search
            </button>
          </div>
        </div>

        {loading && rows.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 py-20 flex flex-col items-center gap-4">
            <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
            <p className="text-gray-600">Loading food sale report...</p>
          </div>
        ) : (
          <>
            {/* Date-wise Report */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
              <h2 className="text-lg font-bold text-slate-900 mb-4">Date-wise Report ({rows.length})</h2>
              {rows.length === 0 ? (
                <div className="py-16 text-center">
                  <p className="text-lg font-semibold text-slate-700 mb-1">No delivered orders found</p>
                  <p className="text-sm text-slate-500">Try a different restaurant or date range.</p>
                </div>
              ) : (
                <div className={SCROLL_TABLE_CLASS}>
                  <table className="w-full">
                    <thead className={`bg-slate-50 border-b border-slate-200 ${STICKY_THEAD_CLASS}`}>
                      <tr>
                        <th className={thClass}>S.No.</th>
                        <th className={thClass}>Date</th>
                        <th className={thClass}>Order ID</th>
                        <th className={thClass}>Restaurant Name</th>
                        {MONEY_COLUMNS.map((c) => (
                          <th key={c.key} className={thRight}>{c.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-100">
                      {pagination.pageItems.map((r) => (
                        <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                          <td className={tdClass}>{r.sNo}</td>
                          <td className={tdClass}>{r.date}</td>
                          <td className={`${tdClass} font-medium text-slate-900`}>{r.orderId}</td>
                          <td className={tdClass}>{r.restaurantName}</td>
                          {MONEY_COLUMNS.map((c) => (
                            <td key={c.key} className={tdRight}>{formatINR(r[c.key])}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <TablePagination pagination={pagination} label="orders" />
            </div>

            {/* Month-wise Summary */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                <h2 className="text-lg font-bold text-slate-900">Month-wise Summary</h2>
                {isAllRestaurants && (
                  <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={restaurantWiseBreakdown}
                      onChange={(e) => setRestaurantWiseBreakdown(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300"
                    />
                    Show restaurant-wise breakdown
                  </label>
                )}
              </div>
              {monthRows.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-500">No data for the selected period.</p>
              ) : (
                <div className={SCROLL_TABLE_CLASS}>
                  <table className="w-full">
                    <thead className={`bg-slate-50 border-b border-slate-200 ${STICKY_THEAD_CLASS}`}>
                      <tr>
                        <th className={thClass}>Month</th>
                        <th className={thClass}>Year</th>
                        <th className={thClass}>Restaurant Name</th>
                        <th className={thRight}>Total Orders</th>
                        {MONEY_COLUMNS.map((c) => (
                          <th key={c.key} className={thRight}>{c.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-100">
                      {monthRows.map((m) => (
                        <tr key={`${m.year}-${m.monthNumber}-${m.restaurantId || "all"}`} className="hover:bg-slate-50 transition-colors">
                          <td className={tdClass}>{m.month}</td>
                          <td className={tdClass}>{m.year}</td>
                          <td className={tdClass}>{m.restaurantName}</td>
                          <td className={tdRight}>{m.totalOrders}</td>
                          {MONEY_COLUMNS.map((c) => (
                            <td key={c.key} className={tdRight}>{formatINR(m[c.key])}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Bottom Summary */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <h2 className="text-lg font-bold text-slate-900 mb-4">Summary</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
                <div className="rounded-lg border border-slate-200 p-4 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-slate-500 mb-1">Total Orders</p>
                    <p className="text-xl font-bold text-blue-600">{summary.totalOrders}</p>
                  </div>
                  <ShoppingBag className="w-6 h-6 text-blue-500" />
                </div>
                {MONEY_COLUMNS.map((c) => (
                  <div key={c.key} className="rounded-lg border border-slate-200 p-4 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-slate-500 mb-1">{c.totalLabel}</p>
                      <p className="text-xl font-bold text-slate-900">{formatINR(summary[c.key])}</p>
                    </div>
                    <IndianRupee className="w-5 h-5 text-slate-400" />
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
