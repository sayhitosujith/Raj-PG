import { useState } from 'react'
import { CalendarClock, MoonStar, UsersRound, WalletCards } from 'lucide-react'
import { formatMealWindow, mealDetails } from './meals'
import { formatRupees } from './rent'
import { weekdays, type SiteData } from './siteData'
import { SiteHeading } from './SiteParts'

/**
 * Food and house rules: each property's weekly menu with meal timings (a table on wide screens, a card
 * per day on phones), then the rules every resident lives by.
 */
export function SiteFoodRules({ site }: { site: SiteData }) {
  const withMenu = site.properties.filter((property) => property.menu.length > 0)
  const [propertyId, setPropertyId] = useState(withMenu[0]?.id ?? '')
  const property = withMenu.find((item) => item.id === propertyId) ?? withMenu[0]
  const { houseRules } = site
  const rules = [
    { icon: UsersRound, label: 'Visiting hours', value: houseRules.visitingHours },
    { icon: MoonStar, label: 'Quiet hours', value: houseRules.quietHours },
    { icon: CalendarClock, label: 'Notice to move out', value: houseRules.noticePeriodDays ? `${houseRules.noticePeriodDays} days` : 'Not required' },
    ...(houseRules.securityDeposit ? [{ icon: WalletCards, label: 'Security deposit', value: formatRupees(houseRules.securityDeposit) }] : []),
  ]
  const itemsFor = (weekday: number, meal: string) => property?.menu.find((item) => item.weekday === weekday && item.meal === meal)?.items ?? '—'

  return (
    <>
      <section className="site-section">
        <div className="site-heading-row">
          <SiteHeading eyebrow="Food" title="This week's menu" lead={property ? `What is cooking at ${property.name}.` : 'Our weekly menus will be shown here soon.'} />
          {withMenu.length > 1 && <label className="site-select">PG<select value={property?.id} onChange={(event) => setPropertyId(event.target.value)}>{withMenu.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
        </div>
        {property && <>
          <ul className="site-meal-times">{mealDetails.map(({ meal, label, icon: Icon }) => <li key={meal}><Icon size={18} aria-hidden="true" /><strong>{label}</strong><span>{formatMealWindow(property.mealTimes[meal])}</span></li>)}</ul>
          <table className="site-menu-table">
            <thead><tr><th scope="col">Day</th>{mealDetails.map(({ meal, label }) => <th key={meal} scope="col">{label}</th>)}</tr></thead>
            <tbody>{weekdays.map(([weekday, day]) => <tr key={weekday}><th scope="row">{day}</th>{mealDetails.map(({ meal, label }) => <td key={meal} data-label={label}>{itemsFor(weekday, meal)}</td>)}</tr>)}</tbody>
          </table>
        </>}
      </section>
      <section className="site-section">
        <SiteHeading eyebrow="Stay" title="House rules" lead="A few simple rules keep the PG comfortable for everyone." />
        <ul className="site-facts">{rules.map(({ icon: Icon, label, value }) => <li key={label}><Icon size={17} aria-hidden="true" /><span>{label}</span><strong>{value}</strong></li>)}</ul>
      </section>
    </>
  )
}
