import React from 'react'

interface LegendProps {
  color: string
  barangay: string
}

const Legends: React.FC<LegendProps> = ({ color, barangay }) => {
  const colorVariants = {
    darkred: 'bg-red-900',
    red: 'bg-red-600',
    brown: 'bg-orange-950',
    orange: 'bg-orange-600',
    lightorange: 'bg-orange-300',
    yellow: 'bg-yellow-700',
    lightyellow: 'bg-yellow-400'
  }

  return (
    <div className='flex items-center'>
      <div className={`w-3 h-3 ${colorVariants[color as keyof typeof colorVariants]}`}></div>
      &nbsp;
      <div>{barangay}</div>
    </div>
  )
}

export default Legends
