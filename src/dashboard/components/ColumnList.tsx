import type { ColumnProfile, TableSchema } from '@/types'
import { ColumnTypeBadge } from '@/components/ColumnTypeBadge'
import {
  Stat,
  CompletenessBar,
  NumericStats,
  StringStats,
  BooleanStats,
  DateStats,
} from './ColumnStatComponents'

export function ColumnList({
  schema,
  profile,
  rowCount,
}: {
  schema: TableSchema
  profile?: { columns: ColumnProfile[] }
  rowCount: number
}) {
  const profileMap = new Map<string, ColumnProfile>()
  const profileByName = new Map<string, ColumnProfile>()
  
  if (profile?.columns) {
    for (const cp of profile.columns) {
      profileMap.set(cp.columnId, cp)
      if (cp.columnId) {
        profileByName.set(cp.columnId.toLowerCase(), cp)
      }
    }
  }

  return (
    <div className="divide-y divide-border">
      {schema.columns.map((col, index) => {
        let colProfile = profileMap.get(col.id)
        if (!colProfile) {
          colProfile = profileByName.get(col.name.toLowerCase())
        }
        if (!colProfile && profile?.columns?.[index]) {
          colProfile = profile.columns[index]
        }
        
        return (
          <ColumnRow 
            key={col.id} 
            column={col} 
            profile={colProfile}
            rowCount={rowCount}
          />
        )
      })}
    </div>
  )
}


function ColumnRow({
  column,
  profile,
  rowCount,
}: {
  column: { id: string; name: string; type: string }
  profile?: ColumnProfile
  rowCount: number
}) {
  const t = column.type.toLowerCase()
  const isNumeric = ['number', 'integer', 'float', 'double', 'decimal'].includes(t)
  const isString = ['string', 'varchar', 'text', 'char'].includes(t)
  const isBoolean = ['boolean', 'bool'].includes(t)
  const isDate = ['date', 'datetime', 'timestamp', 'time'].includes(t)

  const completeness = profile ? Math.round(100 - (profile.missingPercent || 0)) : 100
  const missingCount = profile?.missingCount || 0

  return (
    <div className="px-4 py-3">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-text-primary">{column.name}</span>
          <ColumnTypeBadge type={column.type} />
        </div>
        <div className="flex items-center gap-2">
          {missingCount > 0 && (
            <span className="text-xs text-text-tertiary">
              {missingCount.toLocaleString()} missing
            </span>
          )}
          <CompletenessBar value={completeness} />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-3">
        {profile ? (
          <>
            {isNumeric && <NumericStats profile={profile} rowCount={rowCount} />}
            {isString && <StringStats profile={profile} rowCount={rowCount} />}
            {isBoolean && <BooleanStats profile={profile} />}
            {isDate && <DateStats profile={profile} />}
            
            {profile.distinctCount !== undefined && (
              <Stat label="Distinct Values" value={profile.distinctCount.toLocaleString()} />
            )}
          </>
        ) : (
          <Stat label="Values" value={rowCount.toLocaleString()} subtext="(profiling pending)" />
        )}
      </div>
    </div>
  )
}
