<template>
  <section class="page">
    <h2>Core Platform Architecture</h2>
    <p>
      This studio management system runs entirely on your local network, with
      MySQL as the system of record and offline-safe operation in the Vue app.
    </p>

    <div class="tiles">
      <RouterLink class="tile" to="/reservations"
        >Manage reservations</RouterLink
      >
      <RouterLink class="tile" to="/resources">Manage resources</RouterLink>
      <RouterLink class="tile" to="/users">Manage users</RouterLink>
      <RouterLink class="tile" to="/orders">Manage orders</RouterLink>
      <RouterLink class="tile" to="/refunds">Manage refunds</RouterLink>
      <RouterLink class="tile" to="/audit-trails"
        >Inspect audit trail</RouterLink
      >
    </div>
  </section>
</template>
