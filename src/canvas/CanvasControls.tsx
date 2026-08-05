import {
  ControlButton,
  Controls,
  useReactFlow,
  useStore,
  type FitViewOptions,
} from 'reactflow'
import { DelayedHoverTooltip } from '@/components/DelayedHoverTooltip'

interface CanvasControlsProps {
  fitViewOptions: FitViewOptions
}

export function CanvasControls({ fitViewOptions }: CanvasControlsProps) {
  const { zoomIn, zoomOut, fitView } = useReactFlow()
  const minZoomReached = useStore((s) => s.transform[2] <= s.minZoom)
  const maxZoomReached = useStore((s) => s.transform[2] >= s.maxZoom)

  return (
    <Controls
      showZoom={false}
      showFitView={false}
      showInteractive={false}
      fitViewOptions={fitViewOptions}
      position="bottom-left"
      style={{ marginLeft: 12, marginBottom: 12 }}
      className="!z-sticky !rounded-lg !border !border-border !bg-surface !shadow-md [&>span>button]:!border-0 [&>span>button]:!bg-surface [&>span>button]:!text-text-secondary [&>span>button:hover]:!bg-surface-secondary"
    >
      <DelayedHoverTooltip label="Zoom in" side="right">
        <ControlButton
          onClick={() => zoomIn()}
          className="react-flow__controls-zoomin"
          aria-label="zoom in"
          disabled={maxZoomReached}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" aria-hidden="true">
            <path d="M32 18.133H18.133V32h-4.266V18.133H0v-4.266h13.867V0h4.266v13.867H32z" />
          </svg>
        </ControlButton>
      </DelayedHoverTooltip>
      <DelayedHoverTooltip label="Zoom out" side="right">
        <ControlButton
          onClick={() => zoomOut()}
          className="react-flow__controls-zoomout"
          aria-label="zoom out"
          disabled={minZoomReached}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 5" aria-hidden="true">
            <path d="M0 0h32v4.2H0z" />
          </svg>
        </ControlButton>
      </DelayedHoverTooltip>
      <DelayedHoverTooltip label="Fit view" side="right">
        <ControlButton
          className="react-flow__controls-fitview"
          onClick={() => fitView(fitViewOptions)}
          aria-label="fit view"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 30" aria-hidden="true">
            <path d="M3.692 4.63c0-.53.4-.938.939-.938h5.215V0H4.708C2.13 0 0 2.054 0 4.63v5.216h3.692V4.631zM27.354 0h-5.2v3.692h5.17c.53 0 .984.4.984.939v5.215H32V4.631A4.624 4.624 0 0027.354 0zm.954 24.83c0 .532-.4.94-.939.94h-5.215v3.768h5.215c2.577 0 4.631-2.13 4.631-4.707v-5.139h-3.692v5.139zm-23.677.94c-.531 0-.939-.4-.939-.94v-5.138H0v5.139c0 2.577 2.13 4.707 4.708 4.707h5.138V25.77H4.631z" />
          </svg>
        </ControlButton>
      </DelayedHoverTooltip>
    </Controls>
  )
}
