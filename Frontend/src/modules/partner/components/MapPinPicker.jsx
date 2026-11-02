import { useEffect, useRef, useState, useCallback } from "react"
import { Crosshair, Loader2, MapPin, Search } from "lucide-react"
import { getGoogleMapsApiKey } from "@food/utils/googleMapsApiKey"
import L from "leaflet"

/** The address fields we fill from a Google place or an OpenStreetMap result. */
const fromGooglePlace = (place) => {
  const get = (type, short = false) => {
    const c = (place?.address_components || []).find((x) => x.types.includes(type))
    return c ? (short ? c.short_name : c.long_name) : ""
  }
  const street = [get("street_number"), get("route")].filter(Boolean).join(" ")
  return {
    addressLine1: [place?.name, street].filter(Boolean).join(", ") || place?.formatted_address || "",
    area: get("sublocality_level_1") || get("sublocality") || get("neighborhood"),
    city: get("locality") || get("administrative_area_level_2"),
    state: get("administrative_area_level_1"),
    pincode: get("postal_code"),
  }
}
const fromOsm = (r) => {
  const a = r?.address || {}
  return {
    addressLine1: String(r?.display_name || "").split(",").slice(0, 2).join(",").trim(),
    area: a.suburb || a.neighbourhood || a.quarter || a.city_district || "",
    city: a.city || a.town || a.village || a.county || "",
    state: a.state || "",
    pincode: a.postcode || "",
  }
}

const createLeafletPinIcon = () =>
  L.divIcon({
    className: "custom-leaflet-pin",
    html: `<div style="display:flex;align-items:center;justify-content:center;width:32px;height:42px;transform:translate(-16px,-42px);cursor:pointer;filter:drop-shadow(0 2px 5px rgba(0,0,0,0.4));">
      <svg width="32" height="42" viewBox="0 0 24 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 0C5.37 0 0 5.37 0 12c0 9 12 20 12 20s12-11 12-20c0-6.63-5.37-12-12-12z" fill="#EF4444"/>
        <circle cx="12" cy="11" r="4.5" fill="#FFFFFF"/>
      </svg>
    </div>`,
    iconSize: [32, 42],
    iconAnchor: [16, 42],
  })

/**
 * Drop a pin on the store's front door.
 *
 * Search the address (Google, with OpenStreetMap as a fallback), click the
 * map or drag the pin; "Use my location" centres it on the device. The chosen
 * zone's boundary is drawn so the pin can be placed inside it.
 *
 * If Google Maps fails (no key, billing disabled, quota exceeded), it
 * seamlessly falls back to Leaflet + OpenStreetMap so onboarding is NEVER blocked.
 */

let mapsPromise = null
const loadMaps = async () => {
  if (window.google?.maps?.Map) return true
  if (mapsPromise) return mapsPromise
  mapsPromise = (async () => {
    const key = await getGoogleMapsApiKey()
    if (!key) return false
    await new Promise((resolve, reject) => {
      const existing = Array.from(document.scripts).find((s) => s.src.includes("maps.googleapis.com/maps/api/js"))
      if (existing) {
        if (window.google?.maps?.Map) return resolve()
        existing.addEventListener("load", resolve, { once: true })
        existing.addEventListener("error", reject, { once: true })
        return
      }
      const script = document.createElement("script")
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=places`
      script.async = true
      script.onload = resolve
      script.onerror = reject
      document.head.appendChild(script)
    })
    return Boolean(window.google?.maps?.Map)
  })().catch(() => {
    mapsPromise = null
    return false
  })
  return mapsPromise
}

const INDIA = { lat: 22.9734, lng: 78.6569 }

export default function MapPinPicker({ value, onChange, onAddress, zone }) {
  const holder = useRef(null)
  const mapEngineRef = useRef("none")
  const mapRef = useRef(null)
  const markerRef = useRef(null)
  const zoneShapeRef = useRef(null)
  const leafletMapRef = useRef(null)
  const leafletMarkerRef = useRef(null)
  const leafletZoneRef = useRef(null)
  const searchRef = useRef(null)
  const [status, setStatus] = useState("loading")
  const [locating, setLocating] = useState(false)
  const [query, setQuery] = useState("")
  const [osmResults, setOsmResults] = useState([])

  const reverseGeocode = useCallback(async (lat, lng) => {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`,
        { headers: { Accept: "application/json" } }
      )
      const r = await res.json()
      if (r?.address) {
        onAddress?.(fromOsm(r))
        setQuery(r.display_name || "")
      }
    } catch {
      // Non-blocking
    }
  }, [onAddress])

  const placePin = useCallback((point, zoom = 17) => {
    onChange(point)
    reverseGeocode(point.lat, point.lng)

    if (mapEngineRef.current === "leaflet" && leafletMapRef.current) {
      leafletMapRef.current.setView([point.lat, point.lng], zoom)
      if (!leafletMarkerRef.current) {
        const marker = L.marker([point.lat, point.lng], {
          draggable: true,
          icon: createLeafletPinIcon(),
        }).addTo(leafletMapRef.current)
        marker.on("dragend", () => {
          const pos = marker.getLatLng()
          const p = { lat: Number(pos.lat.toFixed(6)), lng: Number(pos.lng.toFixed(6)) }
          onChange(p)
          reverseGeocode(p.lat, p.lng)
        })
        leafletMarkerRef.current = marker
      } else {
        leafletMarkerRef.current.setLatLng([point.lat, point.lng])
      }
    } else if (mapRef.current) {
      mapRef.current.setCenter(point)
      mapRef.current.setZoom(zoom)
      if (markerRef.current) {
        markerRef.current.setPosition(point)
        markerRef.current.setVisible(true)
      }
    }
  }, [onChange, reverseGeocode])

  const hasPin = Number.isFinite(value?.lat) && Number.isFinite(value?.lng)

  // Initialize Leaflet as primary or fallback
  const initLeaflet = useCallback((container, initialPoint, initialZoom) => {
    if (leafletMapRef.current) {
      try { leafletMapRef.current.remove() } catch {}
      leafletMapRef.current = null
    }
    container.innerHTML = ""

    const start = initialPoint ? [initialPoint.lat, initialPoint.lng] : [INDIA.lat, INDIA.lng]
    const map = L.map(container, {
      center: start,
      zoom: initialZoom,
      zoomControl: true,
    })

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap contributors",
    }).addTo(map)

    let marker = null
    if (initialPoint) {
      marker = L.marker(start, {
        draggable: true,
        icon: createLeafletPinIcon(),
      }).addTo(map)
      marker.on("dragend", () => {
        const pos = marker.getLatLng()
        const p = { lat: Number(pos.lat.toFixed(6)), lng: Number(pos.lng.toFixed(6)) }
        onChange(p)
        reverseGeocode(p.lat, p.lng)
      })
    }

    map.on("click", (e) => {
      const { lat, lng } = e.latlng
      const point = { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) }
      if (!marker) {
        marker = L.marker([point.lat, point.lng], {
          draggable: true,
          icon: createLeafletPinIcon(),
        }).addTo(map)
        marker.on("dragend", () => {
          const pos = marker.getLatLng()
          const p = { lat: Number(pos.lat.toFixed(6)), lng: Number(pos.lng.toFixed(6)) }
          onChange(p)
          reverseGeocode(p.lat, p.lng)
        })
      } else {
        marker.setLatLng([point.lat, point.lng])
      }
      leafletMarkerRef.current = marker
      onChange(point)
      reverseGeocode(point.lat, point.lng)
    })

    leafletMapRef.current = map
    leafletMarkerRef.current = marker
    mapEngineRef.current = "leaflet"
    setStatus("ready")
    setTimeout(() => {
      try { map.invalidateSize() } catch {}
    }, 200)
  }, [onChange, reverseGeocode])

  useEffect(() => {
    let cancelled = false

    // Auth failure listener for Google Maps (billing disabled or invalid key)
    window.gm_authFailure = () => {
      if (!cancelled && holder.current && mapEngineRef.current !== "leaflet") {
        console.warn("[MapPinPicker] Google Maps auth failure, switching to Leaflet fallback")
        initLeaflet(holder.current, hasPin ? { lat: value.lat, lng: value.lng } : null, hasPin ? 17 : 5)
      }
    }

    loadMaps().then((ok) => {
      if (cancelled) return
      if (!ok || !holder.current) {
        // Fallback to Leaflet immediately if Google Maps SDK unavailable
        if (holder.current) {
          initLeaflet(holder.current, hasPin ? { lat: value.lat, lng: value.lng } : null, hasPin ? 17 : 5)
        } else {
          setStatus("unavailable")
        }
        return
      }

      try {
        const start = hasPin ? { lat: value.lat, lng: value.lng } : INDIA
        const map = new window.google.maps.Map(holder.current, {
          center: start,
          zoom: hasPin ? 17 : 5,
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: true,
        })
        const marker = new window.google.maps.Marker({
          map,
          position: hasPin ? start : null,
          draggable: true,
        })
        const set = (latLng) => {
          marker.setPosition(latLng)
          const p = { lat: Number(latLng.lat().toFixed(6)), lng: Number(latLng.lng().toFixed(6)) }
          onChange(p)
          reverseGeocode(p.lat, p.lng)
        }
        map.addListener("click", (e) => set(e.latLng))
        marker.addListener("dragend", (e) => set(e.latLng))
        mapRef.current = map
        markerRef.current = marker
        mapEngineRef.current = "google"

        // Google address search, when the Places library is available.
        if (window.google.maps.places?.Autocomplete && searchRef.current) {
          try {
            const ac = new window.google.maps.places.Autocomplete(searchRef.current, {
              componentRestrictions: { country: "in" },
              fields: ["address_components", "geometry", "name", "formatted_address"],
            })
            ac.addListener("place_changed", () => {
              const place = ac.getPlace()
              const loc = place?.geometry?.location
              if (!loc) return
              placePin({ lat: Number(loc.lat().toFixed(6)), lng: Number(loc.lng().toFixed(6)) })
              onAddress?.(fromGooglePlace(place))
              setQuery(place.formatted_address || place.name || "")
            })
          } catch (_) {}
        }
        setStatus("ready")
      } catch (err) {
        console.warn("[MapPinPicker] Google Map init failed, using Leaflet fallback:", err)
        if (holder.current) {
          initLeaflet(holder.current, hasPin ? { lat: value.lat, lng: value.lng } : null, hasPin ? 17 : 5)
        }
      }
    })

    return () => {
      cancelled = true
      if (leafletMapRef.current) {
        try { leafletMapRef.current.remove() } catch {}
        leafletMapRef.current = null
      }
    }
    // Built once; later value changes move the pin below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // OpenStreetMap search suggestions (always available as resilient autocomplete)
  useEffect(() => {
    const q = query.trim()
    if (q.length < 3) {
      setOsmResults([])
      return undefined
    }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=5&countrycodes=in&q=${encodeURIComponent(q)}`,
          { headers: { Accept: "application/json" } },
        )
        const rows = await res.json()
        setOsmResults(Array.isArray(rows) ? rows : [])
      } catch {
        setOsmResults([])
      }
    }, 350)
    return () => clearTimeout(t)
  }, [query])

  // Draw zone polygon (works in both Google Maps and Leaflet)
  useEffect(() => {
    if (status !== "ready") return

    const ring = Array.isArray(zone?.coordinates) ? zone.coordinates : []
    const path = ring
      .map((p) => ({ lat: Number(p.latitude ?? p.lat), lng: Number(p.longitude ?? p.lng) }))
      .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))

    if (mapEngineRef.current === "leaflet" && leafletMapRef.current) {
      if (leafletZoneRef.current) {
        try { leafletZoneRef.current.remove() } catch {}
        leafletZoneRef.current = null
      }
      if (path.length >= 3) {
        const latLngs = path.map((p) => [p.lat, p.lng])
        leafletZoneRef.current = L.polygon(latLngs, {
          color: "#059669",
          weight: 2,
          fillColor: "#10b981",
          fillOpacity: 0.1,
        }).addTo(leafletMapRef.current)

        if (!hasPin) {
          leafletMapRef.current.fitBounds(leafletZoneRef.current.getBounds())
        }
      }
    } else if (mapEngineRef.current === "google" && mapRef.current) {
      zoneShapeRef.current?.setMap(null)
      zoneShapeRef.current = null
      if (path.length >= 3) {
        zoneShapeRef.current = new window.google.maps.Polygon({
          map: mapRef.current,
          paths: path,
          strokeColor: "#059669",
          strokeWeight: 2,
          fillColor: "#10b981",
          fillOpacity: 0.08,
          clickable: false,
        })
        if (!hasPin) {
          const bounds = new window.google.maps.LatLngBounds()
          path.forEach((p) => bounds.extend(p))
          mapRef.current.fitBounds(bounds)
        }
      }
    }
  }, [status, zone, hasPin])

  useEffect(() => {
    if (status !== "ready" || !hasPin) return

    if (mapEngineRef.current === "leaflet" && leafletMapRef.current) {
      if (leafletMarkerRef.current) {
        const current = leafletMarkerRef.current.getLatLng()
        if (current.lat !== value.lat || current.lng !== value.lng) {
          leafletMarkerRef.current.setLatLng([value.lat, value.lng])
        }
      }
    } else if (mapEngineRef.current === "google" && markerRef.current) {
      const current = markerRef.current.getPosition()
      if (!current || current.lat() !== value.lat || current.lng() !== value.lng) {
        markerRef.current.setPosition(value)
      }
    }
  }, [status, hasPin, value])

  const useMyLocation = () => {
    if (!navigator.geolocation) return
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const point = { lat: Number(pos.coords.latitude.toFixed(6)), lng: Number(pos.coords.longitude.toFixed(6)) }
        placePin(point, 18)
        setLocating(false)
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          ref={searchRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search your store's address"
          className="h-11 w-full rounded-xl border border-slate-300 bg-white pl-9 pr-3 text-sm"
          autoComplete="off"
        />
        {osmResults.length > 0 && (
          <ul className="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl">
            {osmResults.map((r) => (
              <li key={r.place_id}>
                <button
                  type="button"
                  onClick={() => {
                    placePin({ lat: Number(Number(r.lat).toFixed(6)), lng: Number(Number(r.lon).toFixed(6)) })
                    onAddress?.(fromOsm(r))
                    setQuery(r.display_name || "")
                    setOsmResults([])
                  }}
                  className="block w-full truncate px-3 py-2 text-left text-sm hover:bg-emerald-50 hover:text-emerald-900 border-b border-slate-100 last:border-b-0"
                >
                  {r.display_name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="relative overflow-hidden rounded-xl border border-slate-300">
        <div ref={holder} className="h-[55vh] min-h-[320px] max-h-[560px] w-full bg-slate-100" />
        {status === "loading" && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-slate-500 bg-white/70">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading map
          </div>
        )}
        {status === "unavailable" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 p-4 text-center text-sm text-slate-600 bg-white">
            <MapPin className="h-5 w-5 text-emerald-600" />
            <p>Tap below to set location, or search address above.</p>
            <button
              type="button"
              onClick={() => {
                if (holder.current) {
                  initLeaflet(holder.current, hasPin ? { lat: value.lat, lng: value.lng } : null, hasPin ? 17 : 5)
                }
              }}
              className="mt-2 px-3 py-1 bg-emerald-600 text-white text-xs font-semibold rounded-lg"
            >
              Open Interactive Map
            </button>
          </div>
        )}
        <button
          type="button"
          onClick={useMyLocation}
          className="absolute bottom-3 right-3 z-[1000] inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow ring-1 ring-slate-200 hover:bg-slate-50"
        >
          {locating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Crosshair className="h-3.5 w-3.5" />}
          Use my location
        </button>
      </div>
      <p className="text-xs text-slate-500">
        {hasPin
          ? `Pinned at ${value.lat}, ${value.lng}. Tap anywhere or drag the pin to your store's entrance.`
          : "Tap anywhere on the map or drag the pin to your store's entrance, or use your location."}
      </p>
    </div>
  )
}

