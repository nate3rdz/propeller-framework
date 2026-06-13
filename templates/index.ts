import { init, getDataSource } from 'propeller-framework';
// import { User } from './entities/User';

const app = await init({
  permissions: ['admin', 'moderator', 'viewer'] as const,
  // entities: [User],

  // accountResolver: async (userId) =>
    // getDataSource().getRepository(User).findOne({ where: { id: userId } }),

  permissionsResolver: (user) => user.roles,
});
