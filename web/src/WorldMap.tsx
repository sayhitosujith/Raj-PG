import { useMemo, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { geoNaturalEarth1, geoPath } from 'd3-geo'
import { numericToAlpha2 } from 'i18n-iso-countries'
import { feature } from 'topojson-client'
import type { GeometryCollection, Topology } from 'topojson-specification'
import world from 'world-atlas/countries-110m.json'
import { countryName } from './countries'
import { useElementWidth } from './useElementWidth'

type CountryShape = { code: string | null; feature: GeoJSON.Feature }

// Natural Earth 1:110m outlines (world-atlas), keyed by ISO numeric id; converted once to alpha-2, the
// form residents' nationality is stored in. Antarctica is left out: nobody lives there and it takes a
// fifth of the height.
const topology = world as unknown as Topology<{ countries: GeometryCollection }>
const shapes: CountryShape[] = feature(topology, topology.objects.countries).features
  .filter((shape) => shape.id !== '010')
  .map((shape) => ({ code: shape.id ? numericToAlpha2(String(shape.id)) ?? null : null, feature: shape }))
// The map is fitted to the land itself, not the whole globe, so no empty ocean band or globe outline
// is left where Antarctica was.
const land: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: shapes.map((shape) => shape.feature) }
// On wide screens the full-width map would be ~800px tall; past this it is centred at this height instead.
const maxHeight = 420

/** The projection and height for a given width: full width when that fits under `maxHeight`, else centred. */
function layout(width: number) {
  const projection = geoNaturalEarth1().fitWidth(width, land)
  const [[, top], [, bottom]] = geoPath(projection).bounds(land)
  const naturalHeight = Math.ceil(bottom - top)
  if (naturalHeight <= maxHeight) return { projection, height: naturalHeight }
  return { projection: geoNaturalEarth1().fitExtent([[0, 0], [width, maxHeight]], land), height: maxHeight }
}

/**
 * Shading from few to most residents: a share of the series colour mixed into the pale end, on a square
 * root so a country with 1 resident stays visible beside one with 100. Countries with none stay neutral.
 */
const shade = (count: number, max: number) => `color-mix(in oklab, var(--report-series-0) ${Math.round(30 + 70 * Math.sqrt(count / max))}%, var(--report-map-low))`

/**
 * A world map with each country shaded by its resident count (single hue, light to dark). Hover shows a
 * country's name and count; countries with residents can be clicked, or reached with Tab and Enter, to
 * select them, which the page uses to list those residents. Drawn with d3-geo into plain SVG at the
 * measured width, so the outlines stay crisp and the 11px labels never scale.
 */
export function WorldMap({ counts, selected, onSelect }: { counts: Record<string, number>; selected: string | null; onSelect: (code: string | null) => void }) {
  const [ref, width] = useElementWidth<HTMLDivElement>(640)
  const [hover, setHover] = useState<{ code: string; x: number; y: number } | null>(null)
  const max = Math.max(1, ...Object.values(counts))
  const { height, countries } = useMemo(() => {
    const { projection, height } = layout(width)
    const path = geoPath(projection)
    return { height, countries: shapes.map((shape) => ({ ...shape, d: path(shape.feature) ?? '' })) }
  }, [width])
  const track = (code: string) => (event: MouseEvent<SVGPathElement>) => {
    const box = event.currentTarget.ownerSVGElement?.getBoundingClientRect()
    if (box) setHover({ code, x: event.clientX - box.left, y: event.clientY - box.top })
  }
  const choose = (code: string) => onSelect(selected === code ? null : code)
  const onKey = (code: string) => (event: KeyboardEvent<SVGPathElement>) => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(code) }
  }
  const hovered = hover ? counts[hover.code] ?? 0 : 0

  return (
    <div ref={ref} className="report-map">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`World map of residents by nationality: ${Object.entries(counts).map(([code, count]) => `${countryName(code)} ${count}`).join(', ')}`}>
        {countries.map(({ code, d }, index) => {
          const count = code ? counts[code] ?? 0 : 0
          if (!count || !code) return <path key={code ?? `shape-${index}`} className="report-map-country" d={d} onMouseMove={code ? track(code) : undefined} onMouseLeave={() => setHover(null)} />
          return <path key={code} className={`report-map-country has-residents${selected === code ? ' is-selected' : ''}`} d={d} style={{ fill: shade(count, max) }} tabIndex={0} role="button" aria-pressed={selected === code} aria-label={`${countryName(code)}: ${count} resident${count === 1 ? '' : 's'}`}
            onMouseMove={track(code)} onMouseLeave={() => setHover(null)} onClick={() => choose(code)} onKeyDown={onKey(code)} />
        })}
      </svg>
      {hover && (
        <div className="report-chart-tooltip report-map-tooltip" role="status" style={hover.x > width / 2 ? { right: width - hover.x + 12, top: hover.y + 12 } : { left: hover.x + 12, top: hover.y + 12 }}>
          <strong>{countryName(hover.code)}</strong>
          <span className="is-total">Residents<b>{hovered}</b></span>
        </div>
      )}
      <div className="report-map-legend" aria-hidden="true">
        <span>{max > 1 ? 1 : ''}</span><i style={{ background: `linear-gradient(90deg, ${shade(1, max)}, ${shade(max, max)})` }} /><span>{max} resident{max === 1 ? '' : 's'}</span>
      </div>
    </div>
  )
}
