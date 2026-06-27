import { SetMetadata } from '@nestjs/common';

export const SKIP_ORG_STATUS_KEY = 'skipOrgStatusCheck';
export const SkipOrgStatusCheck = () => SetMetadata(SKIP_ORG_STATUS_KEY, true);
