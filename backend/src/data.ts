export const fallbackDashboard = {
  stats: {
    properties: '03',
    residents: '101',
    collected: '₹6.42L',
    openRequests: '12',
  },
  properties: [
    { name: 'The Fern House', location: 'Koramangala, Bengaluru', occupancy: '92%', beds: '46 / 50', status: 'Healthy', tone: 'sage', image: 'https://images.unsplash.com/photo-1560185008-b033106af5c3?auto=format&fit=crop&w=900&q=80' },
    { name: 'North Star Living', location: 'Hitech City, Hyderabad', occupancy: '78%', beds: '31 / 40', status: 'Watch', tone: 'gold', image: 'https://images.unsplash.com/photo-1555854877-bab0e564b8d5?auto=format&fit=crop&w=900&q=80' },
    { name: 'Casa 21', location: 'Indiranagar, Bengaluru', occupancy: '96%', beds: '24 / 25', status: 'Healthy', tone: 'sage', image: 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=900&q=80' },
  ],
  activity: [
    { title: 'Rent collected', description: 'The Fern House · Room 204', amount: '+ ₹18,500', time: '12 min ago', tone: 'green', icon: 'wallet' },
    { title: 'New booking request', description: 'North Star Living · Ananya S.', amount: 'Review', time: '38 min ago', tone: 'orange', icon: 'clipboard' },
    { title: 'Maintenance resolved', description: 'Casa 21 · Room 118', amount: 'Closed', time: '1 hr ago', tone: 'blue', icon: 'door' },
  ],
}
