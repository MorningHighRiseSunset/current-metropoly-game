import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { PnLPoint } from '../types';

interface PnLChartProps {
  data: PnLPoint[];
}

export const PnLChart: React.FC<PnLChartProps> = ({ data }) => {
  return (
    <div className="w-full h-48 bg-black/40 rounded-lg p-4 border border-white/10 backdrop-blur-sm">
      <h3 className="text-white/70 text-xs font-bold mb-2 uppercase tracking-widest">Cumulative PnL</h3>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
          <XAxis 
            dataKey="hand" 
            stroke="#ffffff50" 
            fontSize={10} 
            tickLine={false}
            axisLine={false}
          />
          <YAxis 
            stroke="#ffffff50" 
            fontSize={10} 
            tickLine={false}
            axisLine={false}
            domain={['auto', 'auto']}
            tickFormatter={(value) => `${value >= 0 ? '+' : ''}${value}`}
          />
          <Tooltip 
            contentStyle={{ backgroundColor: '#0f2015', borderColor: '#fbbf24', borderRadius: '8px' }}
            itemStyle={{ color: '#fbbf24' }}
            formatter={(value: number) => [`${value >= 0 ? '+' : ''}$${value.toLocaleString()}`, 'PnL']}
            labelFormatter={(label) => `Hand ${label}`}
          />
          <ReferenceLine y={0} stroke="#ffffff50" strokeDasharray="3 3" />
          <Line 
            type="monotone" 
            dataKey="pnl" 
            stroke="#fbbf24" 
            strokeWidth={2} 
            dot={false}
            activeDot={{ r: 4, fill: '#fbbf24' }}
            animationDuration={500}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};