import MultiSelectDropdown from './MultiSelectDropdown'
import type { Filters } from '../types'

interface Props {
  filters: Filters
  selectedProjects: string[]
  selectedBacklogAreas: string[]
  selectedTypes: string[]
  onProjectsChange: (projects: string[]) => void
  onBacklogAreasChange: (areas: string[]) => void
  onTypesChange: (types: string[]) => void
}

function FiltersSection({
  filters,
  selectedProjects,
  selectedBacklogAreas,
  selectedTypes,
  onProjectsChange,
  onBacklogAreasChange,
  onTypesChange
}: Props) {
  if ((filters.projects?.length || 0) === 0) return null

  const uniqueProjects = [...new Map(filters.projects.map(p => [p.key, p])).values()]
  const uniqueBacklogAreas = [...new Set(filters.backlogAreas || [])].map(area => ({ name: area }))
  const uniqueTypes = [...new Map(filters.types.map(t => [t.name, t])).values()]

  return (
    <section className="filters-section">
      <div className="filters-row">
        <MultiSelectDropdown
          label="Project"
          options={uniqueProjects}
          selected={selectedProjects}
          onChange={onProjectsChange}
          valueKey="key"
        />
        {(filters.backlogAreas?.length || 0) > 0 && (
          <MultiSelectDropdown
            label="Backlog Area"
            options={uniqueBacklogAreas}
            selected={selectedBacklogAreas}
            onChange={onBacklogAreasChange}
            valueKey="name"
          />
        )}
        {(filters.types?.length || 0) > 0 && (
          <MultiSelectDropdown
            label="Type"
            options={uniqueTypes}
            selected={selectedTypes}
            onChange={onTypesChange}
            valueKey="name"
          />
        )}
      </div>
    </section>
  )
}

export default FiltersSection