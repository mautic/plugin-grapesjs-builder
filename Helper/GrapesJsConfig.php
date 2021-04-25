<?php

declare(strict_types=1);

namespace MauticPlugin\GrapesJsBuilderBundle\Helper;

use Mautic\IntegrationsBundle\Exception\IntegrationNotFoundException;
use Mautic\IntegrationsBundle\Helper\BuilderIntegrationsHelper;

class GrapesJsConfig
{
    private BuilderIntegrationsHelper $builderIntegrationsHelper;

    public function __construct(BuilderIntegrationsHelper $builderIntegrationsHelper)
    {
        $this->builderIntegrationsHelper = $builderIntegrationsHelper;
    }

    public function isEnabled()
    {
    }
}
