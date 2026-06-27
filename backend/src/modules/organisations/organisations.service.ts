import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Organisation } from '../../entities/organisation.entity';
import { UpdateOrganisationDto } from './dto/update-organisation.dto';

@Injectable()
export class OrganisationsService {
  constructor(
    @InjectRepository(Organisation)
    private organisationRepository: Repository<Organisation>,
  ) {}

  async findOne(id: string) {
    const organisation = await this.organisationRepository.findOne({
      where: { id },
    });

    if (!organisation) {
      throw new NotFoundException('Organisation not found');
    }

    return organisation;
  }

  async findByUserId(organisationId: string) {
    return this.findOne(organisationId);
  }

  async update(id: string, requestingUserOrgId: string, updateOrganisationDto: UpdateOrganisationDto) {
    // Ensure user can only update their own organisation
    if (id !== requestingUserOrgId) {
      throw new ForbiddenException('You can only update your own organisation');
    }

    const organisation = await this.findOne(id);

    // Update fields
    if (updateOrganisationDto.name !== undefined) {
      organisation.name = updateOrganisationDto.name;
    }
    if (updateOrganisationDto.address !== undefined) {
      organisation.address = updateOrganisationDto.address;
    }
    if (updateOrganisationDto.city !== undefined) {
      organisation.city = updateOrganisationDto.city;
    }
    if (updateOrganisationDto.state !== undefined) {
      organisation.state = updateOrganisationDto.state;
    }
    if (updateOrganisationDto.pincode !== undefined) {
      organisation.pincode = updateOrganisationDto.pincode;
    }
    if (updateOrganisationDto.phone !== undefined) {
      organisation.phone = updateOrganisationDto.phone;
    }
    if (updateOrganisationDto.email !== undefined) {
      organisation.email = updateOrganisationDto.email;
    }

    await this.organisationRepository.save(organisation);

    return organisation;
  }
}
