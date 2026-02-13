<?php

declare(strict_types=1);

namespace MauticPlugin\GrapesJsBuilderBundle\Model;

use Doctrine\ORM\EntityManager;
use Mautic\CoreBundle\Helper\CoreParametersHelper;
use Mautic\CoreBundle\Helper\UserHelper;
use Mautic\CoreBundle\Model\AbstractCommonModel;
use Mautic\CoreBundle\Security\Permissions\CorePermissions;
use Mautic\CoreBundle\Translation\Translator;
use Mautic\EmailBundle\Entity\Email;
use Mautic\PageBundle\Entity\Page;
use Mautic\EmailBundle\Model\EmailModel;
use MauticPlugin\GrapesJsBuilderBundle\Entity\GrapesJsBuilder;
use MauticPlugin\GrapesJsBuilderBundle\Entity\GrapesJsBuilderRepository;
use Psr\Log\LoggerInterface;
use Symfony\Component\EventDispatcher\EventDispatcherInterface;
use Symfony\Component\HttpFoundation\RequestStack;
use Symfony\Component\Routing\Generator\UrlGeneratorInterface;

/**
 * @extends AbstractCommonModel<GrapesJsBuilder>
 */
class GrapesJsBuilderModel extends AbstractCommonModel
{
    public function __construct(
        private RequestStack $requestStack,
        private EmailModel $emailModel,
        EntityManager $em,
        CorePermissions $security,
        EventDispatcherInterface $dispatcher,
        UrlGeneratorInterface $router,
        Translator $translator,
        UserHelper $userHelper,
        LoggerInterface $mauticLogger,
        CoreParametersHelper $coreParametersHelper,
    ) {
        parent::__construct($em, $security, $dispatcher, $router, $translator, $userHelper, $mauticLogger, $coreParametersHelper);
    }

    /**
     * @return GrapesJsBuilderRepository
     */
    public function getRepository()
    {
        /** @var GrapesJsBuilderRepository $repository */
        $repository = $this->em->getRepository(GrapesJsBuilder::class);

        $repository->setTranslator($this->translator);

        return $repository;
    }

    /**
     * Add or edit entity settings based on request. Supports `Email` and `Page`.
     */
    public function addOrEditEntity(object $entity): void
    {
        $currentRequest = $this->requestStack->getCurrentRequest();
        if (!$currentRequest || !$currentRequest->request->has('grapesjsbuilder')) {
            return;
        }

        $data = $currentRequest->request->all('grapesjsbuilder');

        // Email-specific handling (existing behavior)
        if ($entity instanceof Email) {
            if ($this->emailModel->isUpdatingTranslationChildren()) {
                return;
            }

            $grapesJsBuilder = $this->getRepository()->findOneBy(['email' => $entity]);

            if (!$grapesJsBuilder) {
                $grapesJsBuilder = new GrapesJsBuilder();
                $grapesJsBuilder->setEmail($entity);
            }

            if (is_array($data) && isset($data['customMjml'])) {
                $grapesJsBuilder->setCustomMjml($data['customMjml']);
            }

            if (is_array($data) && (array_key_exists('editorState', $data) || array_key_exists('projectData', $data))) {
                $editorState = $data['editorState'] ?? $data['projectData'];

                if (is_string($editorState)) {
                    $decoded = json_decode($editorState, true);
                    if (json_last_error() === JSON_ERROR_NONE) {
                        $editorState = $decoded;
                    }
                }

                $content = $entity->getContent();
                if (!is_array($content)) {
                    if (is_string($content)) {
                        $decodedContent = json_decode($content, true);
                        if (json_last_error() === JSON_ERROR_NONE && is_array($decodedContent)) {
                            $content = $decodedContent;
                        } else {
                            $content = [];
                        }
                    } else {
                        $content = [];
                    }
                }

                if (!isset($content['grapesjsbuilder']) || !is_array($content['grapesjsbuilder'])) {
                    $content['grapesjsbuilder'] = [];
                }

                $content['grapesjsbuilder']['editorState'] = $editorState;
                $content['grapesjsbuilder']['updatedAt']  = (new \DateTime())->format('c');

                $entity->setContent($content);
            }

            $this->getRepository()->saveEntity($grapesJsBuilder);

            $customHtml = $currentRequest->get('emailform')['customHtml'] ?? null;
            if (is_null($customHtml)) {
                $customHtml = $currentRequest->get('customHtml') ?? null;
            }
            $entity->setCustomHtml($customHtml);
            $this->emailModel->getRepository()->saveEntity($entity);
            return;
        }

        // Page-specific handling: persist editorState into Page::content
        if ($entity instanceof Page) {
            if (is_array($data) && (array_key_exists('editorState', $data) || array_key_exists('projectData', $data))) {
                $editorState = $data['editorState'] ?? $data['projectData'];

                if (is_string($editorState)) {
                    $decoded = json_decode($editorState, true);
                    if (json_last_error() === JSON_ERROR_NONE) {
                        $editorState = $decoded;
                    }
                }

                $content = $entity->getContent();
                if (!is_array($content)) {
                    if (is_string($content)) {
                        $decodedContent = json_decode($content, true);
                        if (json_last_error() === JSON_ERROR_NONE && is_array($decodedContent)) {
                            $content = $decodedContent;
                        } else {
                            $content = [];
                        }
                    } else {
                        $content = [];
                    }
                }

                if (!isset($content['grapesjsbuilder']) || !is_array($content['grapesjsbuilder'])) {
                    $content['grapesjsbuilder'] = [];
                }

                $content['grapesjsbuilder']['editorState'] = $editorState;
                $content['grapesjsbuilder']['updatedAt']  = (new \DateTime())->format('c');

                $entity->setContent($content);

                $this->em->persist($entity);
                $this->em->flush();
            }
        }
    }

    public function getGrapesJsFromEmailId(?int $emailId)
    {
        if ($email = $this->emailModel->getEntity($emailId)) {
            return $this->getRepository()->findOneBy(['email' => $email]);
        }
    }
}
